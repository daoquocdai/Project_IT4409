package repository

import (
	"context"
	"errors"

	attachmentmodel "github.com/daoquocdai/chat-api/internal/module/attachment/model"
	threadmodel "github.com/daoquocdai/chat-api/internal/module/thread/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

func (r *Postgres) CreatePending(ctx context.Context, actorID, threadID, attachmentID, storageKey string, size int64) error {
	var internalUserID, internalThreadID int64
	err := r.pool.QueryRow(ctx, `
		SELECT u.id, t.id
		FROM users u CROSS JOIN threads t
		WHERE u.external_id = $1::uuid AND t.external_id = $2::uuid
		  AND EXISTS (SELECT 1 FROM participants p WHERE p.thread_id=t.id AND p.user_id=u.id AND p.left_seq IS NULL)`,
		actorID, threadID).Scan(&internalUserID, &internalThreadID)
	if errors.Is(err, pgx.ErrNoRows) {
		var exists bool
		if scanErr := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM threads WHERE external_id=$1::uuid)`, threadID).Scan(&exists); scanErr != nil {
			return scanErr
		}
		if exists {
			return threadmodel.ErrNotParticipant
		}
		return threadmodel.ErrThreadNotFound
	}
	if err != nil {
		return err
	}

	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, internalUserID); err != nil {
			return err
		}
		var active bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM participants WHERE thread_id=$1 AND user_id=$2 AND left_seq IS NULL)`, internalThreadID, internalUserID).Scan(&active); err != nil {
			return err
		}
		if !active {
			return threadmodel.ErrNotParticipant
		}
		var used int64
		if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(size_bytes),0)::bigint FROM attachments WHERE uploader_id=$1 AND status IN ('pending','attached')`, internalUserID).Scan(&used); err != nil {
			return err
		}
		if used > attachmentmodel.MaximumUserBytes-size {
			return attachmentmodel.ErrQuotaExceeded
		}
		_, err := tx.Exec(ctx, `INSERT INTO attachments(id,thread_id,uploader_id,storage_key,size_bytes) VALUES($1::uuid,$2,$3,$4,$5)`, attachmentID, internalThreadID, internalUserID, storageKey, size)
		return err
	})
}

func (r *Postgres) Content(ctx context.Context, actorID, attachmentID string) (attachmentmodel.Attachment, error) {
	var result attachmentmodel.Attachment
	err := r.pool.QueryRow(ctx, `
		SELECT a.id::text, a.storage_key, a.size_bytes
		FROM attachments a
		JOIN messages m ON m.id=a.message_id
		JOIN users actor ON actor.external_id=$1::uuid
		WHERE a.id=$2::uuid AND a.status='attached'
		  AND EXISTS (
		    SELECT 1 FROM participants p
		    WHERE p.thread_id=a.thread_id AND p.user_id=actor.id
		      AND p.joined_seq <= m.seq AND (p.left_seq IS NULL OR p.left_seq >= m.seq)
		  )`, actorID, attachmentID).Scan(&result.ID, &result.StorageKey, &result.SizeBytes)
	if err == nil {
		return result, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return result, err
	}
	var exists bool
	if scanErr := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM attachments WHERE id=$1::uuid AND status='attached')`, attachmentID).Scan(&exists); scanErr != nil {
		return result, scanErr
	}
	if exists {
		return result, attachmentmodel.ErrForbidden
	}
	return result, attachmentmodel.ErrNotFound
}

func (r *Postgres) ClaimExpired(ctx context.Context) ([]attachmentmodel.Attachment, error) {
	rows, err := r.pool.Query(ctx, `
		UPDATE attachments SET status='deleting'
		WHERE id IN (
			SELECT id FROM attachments
			WHERE status='deleting' OR (status='pending' AND created_at < NOW()-INTERVAL '24 hours')
			FOR UPDATE SKIP LOCKED LIMIT 100
		)
		RETURNING id::text, storage_key, size_bytes`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []attachmentmodel.Attachment
	for rows.Next() {
		var item attachmentmodel.Attachment
		if err := rows.Scan(&item.ID, &item.StorageKey, &item.SizeBytes); err != nil {
			return nil, err
		}
		results = append(results, item)
	}
	return results, rows.Err()
}

func (r *Postgres) FinishDelete(ctx context.Context, id string, removed bool) error {
	if removed {
		_, err := r.pool.Exec(ctx, `DELETE FROM attachments WHERE id=$1::uuid AND status='deleting'`, id)
		return err
	}
	_, err := r.pool.Exec(ctx, `UPDATE attachments SET status='pending' WHERE id=$1::uuid AND status='deleting'`, id)
	return err
}
