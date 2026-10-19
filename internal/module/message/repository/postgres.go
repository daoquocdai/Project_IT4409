package repository

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/daoquocdai/chat-api/internal/database/sqlc"
	"github.com/daoquocdai/chat-api/internal/e2ee"
	"github.com/daoquocdai/chat-api/internal/module/message/model"
	threadmodel "github.com/daoquocdai/chat-api/internal/module/thread/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) Send(
	ctx context.Context,
	threadExternalID string,
	senderID int64,
	messageID, contentFormat, content string,
) (model.Message, bool, error) {
	return r.send(ctx, threadExternalID, senderID, messageID, contentFormat, content, nil)
}

func (r *PostgresRepository) SendWithAttachments(
	ctx context.Context,
	threadExternalID string,
	senderID int64,
	messageID, contentFormat, content string,
	attachmentIDs []string,
) (model.Message, bool, error) {
	return r.send(ctx, threadExternalID, senderID, messageID, contentFormat, content, attachmentIDs)
}

func (r *PostgresRepository) send(
	ctx context.Context,
	threadExternalID string,
	senderID int64,
	messageID, contentFormat, content string,
	attachmentIDs []string,
) (model.Message, bool, error) {
	threadID, err := parseUUID(threadExternalID, model.ErrInvalidThreadID)
	if err != nil {
		return model.Message{}, false, err
	}
	messageExternalID, err := parseUUID(messageID, model.ErrInvalidMessageID)
	if err != nil {
		return model.Message{}, false, err
	}

	var result model.Message
	created := false
	err = pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		queries := sqlc.New(tx)
		thread, err := queries.LockThreadForParticipant(ctx, sqlc.LockThreadForParticipantParams{
			UserID:           senderID,
			ThreadExternalID: threadID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return classifyThreadAccess(ctx, queries, threadID)
			}
			return err
		}
		// Recheck after obtaining the thread lock: membership may have changed while waiting.
		if _, err := queries.GetActiveParticipant(ctx, sqlc.GetActiveParticipantParams{
			ThreadID: thread.ID, UserID: senderID,
		}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return threadmodel.ErrNotParticipant
			}
			return err
		}

		existing, err := queries.GetMessageByExternalID(ctx, messageExternalID)
		if err == nil {
			if existing.ThreadID != thread.ID || existing.SenderID != senderID ||
				existing.Kind != "text" || existing.ContentFormat != contentFormat ||
				existing.Content != content {
				return model.ErrMessageIDConflict
			}
			if matches, matchErr := messageAttachmentsMatch(ctx, tx, existing.ID, attachmentIDs); matchErr != nil {
				return matchErr
			} else if !matches {
				return model.ErrMessageIDConflict
			}
			result = messageFromValues(
				existing.ID, existing.ExternalID, existing.ThreadExternalID,
				existing.SenderExternalID, existing.Seq, existing.ThreadKind, existing.Kind,
				existing.ContentFormat, existing.Content, existing.CreatedAt, existing.RecalledAt,
			)
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		expectedFormat := "plaintext"
		if thread.Kind == "direct" {
			expectedFormat = "e2ee_v2"
		}
		if contentFormat != expectedFormat {
			return model.ErrContentFormatConflict
		}
		var epochID pgtype.UUID
		if contentFormat == "e2ee_v2" {
			epochID, err = validateEnvelopeHeader(ctx, queries, thread.ID, senderID, content)
			if err != nil {
				return err
			}
		}

		seq, err := queries.IncrementThreadSequence(ctx, thread.ID)
		if err != nil {
			return err
		}
		message, err := queries.CreateThreadMessage(ctx, sqlc.CreateThreadMessageParams{
			MessageExternalID: messageExternalID,
			ThreadID:          thread.ID,
			SenderID:          senderID,
			Seq:               seq,
			ContentFormat:     contentFormat,
			EpochID:           epochID,
			Content:           pgtype.Text{String: content, Valid: true},
		})
		if err != nil {
			return err
		}
		if len(attachmentIDs) > 0 {
			command, updateErr := tx.Exec(ctx, `
				UPDATE attachments SET message_id=$1, status='attached'
				WHERE id=ANY($2::uuid[]) AND thread_id=$3 AND uploader_id=$4
				  AND message_id IS NULL AND status='pending'`, message.ID, attachmentIDs, thread.ID, senderID)
			if updateErr != nil {
				return updateErr
			}
			if command.RowsAffected() != int64(len(attachmentIDs)) {
				return model.ErrAttachmentConflict
			}
		}

		created = true
		result = messageFromValues(
			message.ID, message.ExternalID, message.ThreadExternalID,
			message.SenderExternalID, message.Seq, message.ThreadKind, message.Kind,
			message.ContentFormat, message.Content, message.CreatedAt, message.RecalledAt,
		)
		return nil
	})
	if err != nil {
		if isExternalIDUniqueViolation(err) {
			return model.Message{}, false, model.ErrMessageIDConflict
		}
		return model.Message{}, false, err
	}

	return result, created, nil
}

func messageAttachmentsMatch(ctx context.Context, tx pgx.Tx, messageID int64, requested []string) (bool, error) {
	rows, err := tx.Query(ctx, `SELECT id::text FROM attachments WHERE message_id=$1 ORDER BY id`, messageID)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	var stored []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return false, err
		}
		stored = append(stored, id)
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	want := append([]string(nil), requested...)
	sort.Strings(want)
	if len(stored) != len(want) {
		return false, nil
	}
	for i := range stored {
		if stored[i] != want[i] {
			return false, nil
		}
	}
	return true, nil
}

// The server binds a message to its thread/epoch and peer, without decrypting.
func validateEnvelopeHeader(ctx context.Context, queries *sqlc.Queries, threadID, senderID int64, content string) (pgtype.UUID, error) {
	envelope, err := e2ee.ParseMessageEnvelope(content)
	if err != nil {
		return pgtype.UUID{}, model.ErrInvalidEnvelope
	}
	participants, err := queries.GetE2EEMessageParticipants(ctx, threadID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	if len(participants) != 2 {
		return pgtype.UUID{}, model.ErrInvalidEnvelopeHeader
	}
	var senderMatches, recipientMatches bool
	for _, participant := range participants {
		if participant.ID == senderID {
			senderMatches = true
		} else if participant.ExternalID.String() == envelope.RecipientID {
			recipientMatches = true
		}
	}
	if !senderMatches || !recipientMatches {
		return pgtype.UUID{}, model.ErrInvalidEnvelopeHeader
	}
	epochID, err := parseUUID(envelope.EpochID, model.ErrInvalidEnvelopeHeader)
	if err != nil {
		return pgtype.UUID{}, err
	}
	_, err = queries.GetEpochIdentity(ctx, sqlc.GetEpochIdentityParams{EpochID: epochID, ThreadID: threadID})
	if errors.Is(err, pgx.ErrNoRows) {
		return pgtype.UUID{}, model.ErrInvalidEnvelopeHeader
	}
	return epochID, err
}

func (r *PostgresRepository) List(
	ctx context.Context,
	threadExternalID string,
	userID int64,
	beforeSeq *int64,
	limit int,
) (model.Page, error) {
	threadID, err := parseUUID(threadExternalID, model.ErrInvalidThreadID)
	if err != nil {
		return model.Page{}, err
	}
	queries := sqlc.New(r.pool)
	if _, err := queries.GetThreadHistoryAccess(ctx, sqlc.GetThreadHistoryAccessParams{
		UserID:           userID,
		ThreadExternalID: threadID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Page{}, classifyThreadAccess(ctx, queries, threadID)
		}
		return model.Page{}, err
	}

	before := pgtype.Int8{}
	if beforeSeq != nil {
		before = pgtype.Int8{Int64: *beforeSeq, Valid: true}
	}
	rows, err := queries.ListThreadMessagesPage(ctx, sqlc.ListThreadMessagesPageParams{
		UserID:           userID,
		ThreadExternalID: threadID,
		BeforeSeq:        before,
		PageSize:         int32(limit),
	})
	if err != nil {
		return model.Page{}, err
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	messages := make([]model.Message, len(rows))
	for i, row := range rows {
		messages[i] = messageFromValues(
			row.ID, row.ExternalID, row.ThreadExternalID,
			row.SenderExternalID, row.Seq, row.ThreadKind, row.Kind,
			row.ContentFormat, row.Content, row.CreatedAt, row.RecalledAt,
		)
	}

	var nextCursor *int64
	if hasMore {
		cursor := messages[len(messages)-1].Seq
		nextCursor = &cursor
	}

	return model.Page{Messages: messages, NextCursor: nextCursor}, nil
}

func classifyThreadAccess(ctx context.Context, queries *sqlc.Queries, threadID pgtype.UUID) error {
	exists, err := queries.ThreadExistsByExternalID(ctx, threadID)
	if err != nil {
		return err
	}
	if exists {
		return threadmodel.ErrNotParticipant
	}
	return threadmodel.ErrThreadNotFound
}

func parseUUID(value string, invalidError error) (pgtype.UUID, error) {
	var id pgtype.UUID
	if err := id.Scan(value); err != nil {
		return pgtype.UUID{}, invalidError
	}
	return id, nil
}

func messageFromValues(
	id int64,
	externalID, threadExternalID, senderExternalID pgtype.UUID,
	seq int64,
	threadKind, kind, contentFormat, content string,
	createdAt, recalledAt pgtype.Timestamptz,
) model.Message {
	var recalled *time.Time
	if recalledAt.Valid {
		value := recalledAt.Time
		recalled = &value
	}
	return model.Message{
		ID:               id,
		ExternalID:       externalID.String(),
		ThreadExternalID: threadExternalID.String(),
		ThreadKind:       threadKind,
		SenderExternalID: senderExternalID.String(),
		Seq:              seq,
		Kind:             kind,
		ContentFormat:    contentFormat,
		Content:          content,
		RecalledAt:       recalled,
		CreatedAt:        createdAt.Time,
	}
}

func isExternalIDUniqueViolation(err error) bool {
	var postgresError *pgconn.PgError
	return errors.As(err, &postgresError) &&
		postgresError.Code == "23505" &&
		postgresError.ConstraintName == "messages_external_id_key"
}

func (r *PostgresRepository) Recall(ctx context.Context, actorID int64, messageExternalID string) (model.Recall, bool, error) {
	messageID, err := parseUUID(messageExternalID, model.ErrInvalidMessageID)
	if err != nil {
		return model.Recall{}, false, err
	}
	var result model.Recall
	created := false
	err = pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var internalMessageID, internalThreadID, senderID, messageSeq int64
		var recalledAt pgtype.Timestamptz
		err := tx.QueryRow(ctx, `
			SELECT m.id,m.thread_id,m.sender_id,m.seq,m.recalled_at,t.external_id::text,s.external_id::text,
			       COALESCE(e.id::text,''),COALESCE(e.change_seq,0)
			FROM messages m JOIN threads t ON t.id=m.thread_id JOIN users s ON s.id=m.sender_id
			LEFT JOIN message_change_events e ON e.message_id=m.id AND e.event_type='message.recalled'
			WHERE m.external_id=$1 FOR UPDATE OF m`, messageID).
			Scan(&internalMessageID, &internalThreadID, &senderID, &messageSeq, &recalledAt, &result.ThreadID, &result.SenderID, &result.EventID, &result.ChangeSeq)
		if errors.Is(err, pgx.ErrNoRows) {
			return model.ErrMessageNotFound
		}
		if err != nil {
			return err
		}
		if senderID != actorID {
			return model.ErrRecallForbidden
		}
		result.MessageID = messageExternalID
		result.MessageSeq = messageSeq
		if recalledAt.Valid {
			result.RecalledAt = recalledAt.Time
			return nil
		}
		if err := tx.QueryRow(ctx, `UPDATE messages SET recalled_at=NOW(),content=NULL WHERE id=$1 RETURNING recalled_at`, internalMessageID).Scan(&result.RecalledAt); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE attachments SET status='deleting',message_id=NULL WHERE message_id=$1 AND status='attached'`, internalMessageID); err != nil {
			return err
		}
		result.EventID = uuid.NewString()
		if err := tx.QueryRow(ctx, `INSERT INTO message_change_events(id,event_type,message_id,thread_id,recalled_at) VALUES($1,'message.recalled',$2,$3,$4) RETURNING change_seq`, result.EventID, internalMessageID, internalThreadID, result.RecalledAt).Scan(&result.ChangeSeq); err != nil {
			return err
		}
		created = true
		return nil
	})
	return result, created, err
}

func (r *PostgresRepository) ListChanges(ctx context.Context, actorID int64, after int64, limit int) (model.ChangePage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT e.id::text,e.change_seq,m.external_id::text,t.external_id::text,s.external_id::text,m.seq,e.recalled_at
		FROM message_change_events e JOIN messages m ON m.id=e.message_id JOIN threads t ON t.id=e.thread_id JOIN users s ON s.id=m.sender_id
		WHERE e.change_seq>$1 AND EXISTS (SELECT 1 FROM participants p WHERE p.thread_id=e.thread_id AND p.user_id=$2 AND p.joined_seq<=m.seq AND (p.left_seq IS NULL OR p.left_seq>=m.seq))
		ORDER BY e.change_seq LIMIT $3`, after, actorID, limit)
	if err != nil {
		return model.ChangePage{}, err
	}
	defer rows.Close()
	page := model.ChangePage{Changes: []model.Recall{}, NextCursor: after}
	for rows.Next() {
		var change model.Recall
		if err := rows.Scan(&change.EventID, &change.ChangeSeq, &change.MessageID, &change.ThreadID, &change.SenderID, &change.MessageSeq, &change.RecalledAt); err != nil {
			return model.ChangePage{}, err
		}
		page.Changes = append(page.Changes, change)
		page.NextCursor = change.ChangeSeq
	}
	return page, rows.Err()
}

func (r *PostgresRepository) PendingRecallEvents(ctx context.Context, limit int) ([]model.Recall, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT e.id::text,e.change_seq,m.external_id::text,t.external_id::text,s.external_id::text,m.seq,e.recalled_at,
		       ARRAY_AGG(DISTINCT recipient.external_id::text ORDER BY recipient.external_id::text)
		FROM message_change_events e JOIN messages m ON m.id=e.message_id JOIN threads t ON t.id=e.thread_id JOIN users s ON s.id=m.sender_id
		JOIN participants p ON p.thread_id=e.thread_id AND p.joined_seq<=m.seq AND (p.left_seq IS NULL OR p.left_seq>=m.seq)
		JOIN users recipient ON recipient.id=p.user_id
		WHERE e.published_at IS NULL GROUP BY e.id,e.change_seq,m.external_id,t.external_id,s.external_id,m.seq,e.recalled_at
		ORDER BY e.change_seq LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []model.Recall
	for rows.Next() {
		var event model.Recall
		if err := rows.Scan(&event.EventID, &event.ChangeSeq, &event.MessageID, &event.ThreadID, &event.SenderID, &event.MessageSeq, &event.RecalledAt, &event.RecipientIDs); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (r *PostgresRepository) MarkRecallPublished(ctx context.Context, eventID string) error {
	_, err := r.pool.Exec(ctx, `UPDATE message_change_events SET published_at=COALESCE(published_at,NOW()) WHERE id=$1::uuid`, eventID)
	return err
}

// MembershipVersionAtSequence resolves the immutable snapshot key after commit.
func (r *PostgresRepository) MembershipVersionAtSequence(ctx context.Context, threadExternalID string, seq int64) (int64, error) {
	id, err := parseUUID(threadExternalID, model.ErrInvalidThreadID)
	if err != nil {
		return 0, err
	}
	return sqlc.New(r.pool).GetMembershipVersion(ctx, sqlc.GetMembershipVersionParams{ThreadExternalID: id, Seq: seq})
}

// ListMemberIDsAtSequence is only used by the publishing service after commit.
// Historical intervals make this safe even if membership changes before this query.
func (r *PostgresRepository) ListMemberIDsAtSequence(ctx context.Context, threadExternalID string, seq int64) ([]string, error) {
	id, err := parseUUID(threadExternalID, model.ErrInvalidThreadID)
	if err != nil {
		return nil, err
	}
	ids, err := sqlc.New(r.pool).ListMemberIDsAtSequence(ctx, sqlc.ListMemberIDsAtSequenceParams{ThreadExternalID: id, Seq: seq})
	if err != nil {
		return nil, err
	}
	members := make([]string, len(ids))
	for i, id := range ids {
		members[i] = id.String()
	}
	return members, nil
}
