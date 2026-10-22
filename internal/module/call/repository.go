package call

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const callSelect = `SELECT c.external_id::text,t.external_id::text,caller.external_id::text,callee.external_id::text,caller.username,c.media_type,c.status,COALESCE(c.end_reason,''),c.created_at,c.ring_expires_at,c.accepted_at,c.connected_at,c.ended_at FROM calls c JOIN threads t ON t.id=c.thread_id JOIN users caller ON caller.id=c.caller_id JOIN users callee ON callee.id=c.callee_id`

func scanCall(row pgx.Row) (Call, error) {
	var c Call
	err := row.Scan(&c.ID, &c.ThreadID, &c.CallerID, &c.CalleeID, &c.CallerName, &c.MediaType, &c.Status, &c.EndReason, &c.CreatedAt, &c.RingExpiresAt, &c.AcceptedAt, &c.ConnectedAt, &c.EndedAt)
	return c, err
}

func (r *Repository) Create(ctx context.Context, actor, thread, requestID, media string) (Call, error) {
	if _, err := uuid.Parse(requestID); err != nil || (media != "audio" && media != "video") {
		return Call{}, ErrInvalid
	}
	var result Call
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var threadID, callerID, calleeID int64
		err := tx.QueryRow(ctx, `SELECT t.id,me.id,peer.id FROM threads t JOIN users me ON me.external_id=$1 JOIN participants pm ON pm.thread_id=t.id AND pm.user_id=me.id AND pm.left_seq IS NULL JOIN participants pp ON pp.thread_id=t.id AND pp.user_id<>me.id AND pp.left_seq IS NULL JOIN users peer ON peer.id=pp.user_id WHERE t.external_id=$2 AND t.kind='direct'`, actor, thread).Scan(&threadID, &callerID, &calleeID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrForbidden
		}
		if err != nil {
			return err
		}
		// Serialize retries for this logical request so only one invitation is emitted.
		if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, actor+":"+requestID); err != nil {
			return err
		}
		var internal int64
		err = tx.QueryRow(ctx, `SELECT id FROM calls WHERE caller_id=$1 AND client_request_id=$2`, callerID, requestID).Scan(&internal)
		if err == nil {
			result, err = scanCall(tx.QueryRow(ctx, callSelect+` WHERE c.id=$1`, internal))
			return err
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		err = tx.QueryRow(ctx, `INSERT INTO calls(thread_id,caller_id,callee_id,client_request_id,media_type,ring_expires_at) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '30 seconds') RETURNING id`, threadID, callerID, calleeID, requestID, media).Scan(&internal)
		if err != nil {
			var pe *pgconn.PgError
			if errors.As(err, &pe) && pe.Code == "23505" {
				return ErrBusy
			}
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO active_call_users(user_id,call_id) VALUES($1,$3),($2,$3) ON CONFLICT DO NOTHING`, callerID, calleeID, internal); err != nil {
			return err
		}
		var count int
		if err = tx.QueryRow(ctx, `SELECT COUNT(*) FROM active_call_users WHERE call_id=$1`, internal).Scan(&count); err != nil {
			return err
		}
		if count != 2 {
			return ErrBusy
		}
		result, err = scanCall(tx.QueryRow(ctx, callSelect+` WHERE c.id=$1`, internal))
		if err != nil {
			return err
		}
		payload, _ := json.Marshal(map[string]any{"caller_name": result.CallerName})
		_, err = tx.Exec(ctx, `INSERT INTO call_events(call_id,event_type,payload) VALUES($1,'call.invited',$2) ON CONFLICT DO NOTHING`, internal, payload)
		return err
	})
	return result, err
}

func (r *Repository) Get(ctx context.Context, actor, id string) (Call, error) {
	c, err := scanCall(r.pool.QueryRow(ctx, callSelect+` WHERE c.external_id=$1 AND ($2 IN (caller.external_id::text,callee.external_id::text))`, id, actor))
	if errors.Is(err, pgx.ErrNoRows) {
		return Call{}, ErrNotFound
	}
	return c, err
}

func (r *Repository) Transition(ctx context.Context, actor, id, action, reason string) (Call, error) {
	var out Call
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		var internal, internalThread, internalCaller, internalCallee int64
		var caller, callee string
		var status string
		err := tx.QueryRow(ctx, `SELECT c.id,c.thread_id,c.caller_id,c.callee_id,caller.external_id::text,callee.external_id::text,c.status FROM calls c JOIN users caller ON caller.id=c.caller_id JOIN users callee ON callee.id=c.callee_id WHERE c.external_id=$1 FOR UPDATE`, id).Scan(&internal, &internalThread, &internalCaller, &internalCallee, &caller, &callee, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if actor != caller && actor != callee {
			return ErrForbidden
		}
		event := ""
		switch action {
		case "accept":
			if actor != callee || status != "ringing" {
				return ErrConflict
			}
			_, err = tx.Exec(ctx, `UPDATE calls SET status='connecting',accepted_at=NOW() WHERE id=$1`, internal)
			event = "call.accepted"
		case "connected":
			if status != "connecting" && status != "active" {
				return ErrConflict
			}
			_, err = tx.Exec(ctx, `UPDATE calls SET status='active',connected_at=COALESCE(connected_at,NOW()) WHERE id=$1`, internal)
		case "reject":
			if actor != callee || status != "ringing" {
				return ErrConflict
			}
			reason = "rejected"
			fallthrough
		case "end":
			if status == "ended" {
				break
			}
			if reason == "" {
				if status == "active" {
					reason = "completed"
				} else {
					reason = "cancelled"
				}
			}
			if reason != "completed" && reason != "cancelled" && reason != "rejected" && reason != "failed" {
				return ErrInvalid
			}
			_, err = tx.Exec(ctx, `UPDATE calls SET status='ended',end_reason=$2,ended_at=NOW() WHERE id=$1`, internal, reason)
			if err == nil {
				_, err = tx.Exec(ctx, `DELETE FROM active_call_users WHERE call_id=$1`, internal)
			}
			event = "call.ended"
		default:
			return ErrInvalid
		}
		if err != nil {
			return err
		}
		out, err = scanCall(tx.QueryRow(ctx, callSelect+` WHERE c.id=$1`, internal))
		if err != nil {
			return err
		}
		if event != "" {
			if event == "call.ended" {
				var seq int64
				if err = tx.QueryRow(ctx, `UPDATE threads SET last_seq=last_seq+1 WHERE id=$1 RETURNING last_seq`, internalThread).Scan(&seq); err != nil {
					return err
				}
				sender := internalCaller
				if actor == callee {
					sender = internalCallee
				}
				if _, err = tx.Exec(ctx, `INSERT INTO messages(thread_id,sender_id,seq,kind,content_format,content,metadata) VALUES($1,$2,$3,'system','plaintext',$4,jsonb_build_object('call_id',$5::text,'call_media_type',$6::text,'call_end_reason',$7::text))`, internalThread, sender, seq, callSystemContent(out), out.ID, out.MediaType, out.EndReason); err != nil {
					return err
				}
			}
			_, err = tx.Exec(ctx, `INSERT INTO call_events(call_id,event_type) VALUES($1,$2)`, internal, event)
		}
		return err
	})
	return out, err
}

func callSystemContent(value Call) string {
	kind := "thoại"
	if value.MediaType == "video" {
		kind = "video"
	}
	switch value.EndReason {
	case "missed":
		return fmt.Sprintf("Cuộc gọi %s nhỡ", kind)
	case "rejected":
		return fmt.Sprintf("Cuộc gọi %s đã bị từ chối", kind)
	case "cancelled":
		return fmt.Sprintf("Cuộc gọi %s đã bị hủy", kind)
	case "failed":
		return fmt.Sprintf("Cuộc gọi %s không thể kết nối", kind)
	}
	seconds := 0
	if value.ConnectedAt != nil && value.EndedAt != nil {
		seconds = int(value.EndedAt.Sub(*value.ConnectedAt).Seconds())
		if seconds < 0 {
			seconds = 0
		}
	}
	return fmt.Sprintf("Cuộc gọi %s đã kết thúc · %02d:%02d", kind, seconds/60, seconds%60)
}

func (r *Repository) Expire(ctx context.Context) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id,thread_id,caller_id,external_id::text,media_type FROM calls WHERE status='ringing' AND ring_expires_at<=NOW() FOR UPDATE SKIP LOCKED`)
		if err != nil {
			return err
		}
		type expired struct {
			id, threadID, callerID int64
			externalID, mediaType  string
		}
		var items []expired
		for rows.Next() {
			var item expired
			if err = rows.Scan(&item.id, &item.threadID, &item.callerID, &item.externalID, &item.mediaType); err != nil {
				rows.Close()
				return err
			}
			items = append(items, item)
		}
		if err = rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()
		for _, item := range items {
			if _, err = tx.Exec(ctx, `UPDATE calls SET status='ended',end_reason='missed',ended_at=NOW() WHERE id=$1`, item.id); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `DELETE FROM active_call_users WHERE call_id=$1`, item.id); err != nil {
				return err
			}
			var seq int64
			if err = tx.QueryRow(ctx, `UPDATE threads SET last_seq=last_seq+1 WHERE id=$1 RETURNING last_seq`, item.threadID).Scan(&seq); err != nil {
				return err
			}
			content := fmt.Sprintf("Cuộc gọi %s nhỡ", map[bool]string{true: "video", false: "thoại"}[item.mediaType == "video"])
			if _, err = tx.Exec(ctx, `INSERT INTO messages(thread_id,sender_id,seq,kind,content_format,content,metadata) VALUES($1,$2,$3,'system','plaintext',$4,jsonb_build_object('call_id',$5::text,'call_media_type',$6::text,'call_end_reason','missed'))`, item.threadID, item.callerID, seq, content, item.externalID, item.mediaType); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `INSERT INTO call_events(call_id,event_type) VALUES($1,'call.ended')`, item.id); err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) Pending(ctx context.Context) ([]Event, error) {
	rows, err := r.pool.Query(ctx, `SELECT e.id::text,e.event_type,c.external_id::text,t.external_id::text,caller.external_id::text,callee.external_id::text,caller.username,c.media_type,c.status,COALESCE(c.end_reason,''),c.created_at,c.ring_expires_at,c.accepted_at,c.connected_at,c.ended_at,CASE WHEN e.event_type='call.invited' THEN ARRAY[callee.external_id::text] ELSE ARRAY[caller.external_id::text,callee.external_id::text] END FROM call_events e JOIN calls c ON c.id=e.call_id JOIN threads t ON t.id=c.thread_id JOIN users caller ON caller.id=c.caller_id JOIN users callee ON callee.id=c.callee_id WHERE e.published_at IS NULL ORDER BY e.created_at LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.Type, &e.Call.ID, &e.Call.ThreadID, &e.Call.CallerID, &e.Call.CalleeID, &e.Call.CallerName, &e.Call.MediaType, &e.Call.Status, &e.Call.EndReason, &e.Call.CreatedAt, &e.Call.RingExpiresAt, &e.Call.AcceptedAt, &e.Call.ConnectedAt, &e.Call.EndedAt, &e.Recipients); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}
func (r *Repository) Published(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `UPDATE call_events SET published_at=NOW() WHERE id=$1`, id)
	return err
}
