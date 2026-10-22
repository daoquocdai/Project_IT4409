package call

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/daoquocdai/chat-api/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type Publisher struct {
	redis  *redis.Client
	stream string
}

func NewPublisher(client *redis.Client, stream string) *Publisher { return &Publisher{client, stream} }
func (p *Publisher) publish(ctx context.Context, event Event) error {
	recipients, _ := json.Marshal(event.Recipients)
	return p.redis.XAdd(ctx, &redis.XAddArgs{Stream: p.stream, Values: map[string]any{"event": event.Type, "event_id": event.ID, "call_id": event.Call.ID, "thread_id": event.Call.ThreadID, "caller_id": event.Call.CallerID, "callee_id": event.Call.CalleeID, "caller_name": event.Call.CallerName, "media_type": event.Call.MediaType, "status": event.Call.Status, "end_reason": event.Call.EndReason, "ring_expires_at": event.Call.RingExpiresAt.UTC().Format(time.RFC3339Nano), "recipient_ids": string(recipients)}}).Err()
}
func (p *Publisher) Signal(ctx context.Context, c Call, sender, eventType string, payload any) error {
	target := c.CallerID
	if sender == c.CallerID {
		target = c.CalleeID
	}
	body, _ := json.Marshal(payload)
	recipients, _ := json.Marshal([]string{target})
	return p.redis.XAdd(ctx, &redis.XAddArgs{Stream: p.stream, Values: map[string]any{"event": eventType, "call_id": c.ID, "thread_id": c.ThreadID, "sender_id": sender, "recipient_ids": string(recipients), "payload": string(body)}}).Err()
}
func (p *Publisher) publishGroup(ctx context.Context, event GroupEvent) error {
	recipients, _ := json.Marshal(event.Recipients)
	payload, _ := json.Marshal(map[string]any{"created_by": event.Call.CreatedBy, "creator_name": event.Call.CreatorName, "media_type": event.Call.MediaType, "status": event.Call.Status, "version": event.Call.Version, "participants": event.Call.Participants, "ended_at": event.Call.EndedAt})
	return p.redis.XAdd(ctx, &redis.XAddArgs{Stream: p.stream, Values: map[string]any{"event": event.Type, "event_id": event.ID, "call_id": event.Call.ID, "thread_id": event.Call.ThreadID, "recipient_ids": string(recipients), "payload": string(payload)}}).Err()
}
func (p *Publisher) GroupSignal(ctx context.Context, c GroupCall, sender, target, sourceSession, targetSession, eventType string, payload any) error {
	body, _ := json.Marshal(payload); recipients, _ := json.Marshal([]string{target})
	return p.redis.XAdd(ctx, &redis.XAddArgs{Stream: p.stream, Values: map[string]any{"event": eventType, "call_id": c.ID, "thread_id": c.ThreadID, "sender_id": sender, "from_session_id": sourceSession, "target_session_id": targetSession, "recipient_ids": string(recipients), "payload": string(body)}}).Err()
}

type Handler struct {
	repository *Repository
	publisher  *Publisher
}

func NewHandler(r *Repository, p *Publisher) *Handler { return &Handler{r, p} }
func actor(c *gin.Context) (string, bool)             { return middleware.AuthenticatedUserID(c) }
func write(c *gin.Context, err error) {
	code := http.StatusInternalServerError
	switch {
	case errors.Is(err, ErrInvalid):
		code = 400
	case errors.Is(err, ErrForbidden):
		code = 403
	case errors.Is(err, ErrNotFound):
		code = 404
	case errors.Is(err, ErrBusy), errors.Is(err, ErrConflict):
		code = 409
	case errors.Is(err, ErrFull):
		code = 409
	}
	c.JSON(code, gin.H{"error": err.Error()})
}
func response(v Call) gin.H {
	return gin.H{"id": v.ID, "thread_id": v.ThreadID, "caller_id": v.CallerID, "callee_id": v.CalleeID, "caller_name": v.CallerName, "media_type": v.MediaType, "status": v.Status, "end_reason": v.EndReason, "created_at": v.CreatedAt, "ring_expires_at": v.RingExpiresAt, "accepted_at": v.AcceptedAt, "connected_at": v.ConnectedAt, "ended_at": v.EndedAt}
}
func (h *Handler) Create(c *gin.Context) {
	a, _ := actor(c)
	var b struct {
		MediaType       string `json:"mediaType"`
		ClientRequestID string `json:"clientRequestId"`
	}
	if c.ShouldBindJSON(&b) != nil {
		write(c, ErrInvalid)
		return
	}
	v, e := h.repository.Create(c, a, c.Param("id"), b.ClientRequestID, b.MediaType)
	if e != nil {
		write(c, e)
		return
	}
	c.JSON(201, response(v))
}
func (h *Handler) Get(c *gin.Context) {
	a, _ := actor(c)
	v, e := h.repository.Get(c, a, c.Param("id"))
	if e != nil {
		write(c, e)
		return
	}
	c.JSON(200, response(v))
}
func (h *Handler) Accept(c *gin.Context)    { h.transition(c, "accept", "") }
func (h *Handler) Reject(c *gin.Context)    { h.transition(c, "reject", "") }
func (h *Handler) Connected(c *gin.Context) { h.transition(c, "connected", "") }
func (h *Handler) End(c *gin.Context) {
	var b struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&b)
	h.transition(c, "end", b.Reason)
}
func (h *Handler) transition(c *gin.Context, action, reason string) {
	a, _ := actor(c)
	v, e := h.repository.Transition(c, a, c.Param("id"), action, reason)
	if e != nil {
		write(c, e)
		return
	}
	c.JSON(200, response(v))
}
func (h *Handler) ICE(c *gin.Context) {
	a, _ := actor(c)
	if _, e := h.repository.Get(c, a, c.Param("id")); e != nil {
		write(c, e)
		return
	}
	c.JSON(200, gin.H{"iceServers": []gin.H{{"urls": []string{"stun:stun.l.google.com:19302"}}}})
}
func (h *Handler) Signal(c *gin.Context) {
	a, _ := actor(c)
	v, e := h.repository.Get(c, a, c.Param("id"))
	if e != nil {
		write(c, e)
		return
	}
	if v.Status == "ended" {
		write(c, ErrConflict)
		return
	}
	var b struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if c.ShouldBindJSON(&b) != nil || !map[string]bool{"call.offer": true, "call.answer": true, "call.ice": true}[b.Type] || len(b.Payload) > 65536 {
		write(c, ErrInvalid)
		return
	}
	if (b.Type == "call.offer" && a != v.CallerID) || (b.Type == "call.answer" && a != v.CalleeID) {
		write(c, ErrForbidden)
		return
	}
	if (b.Type == "call.offer" || b.Type == "call.answer") && v.Status != "connecting" || b.Type == "call.ice" && v.Status != "connecting" && v.Status != "active" {
		write(c, ErrConflict)
		return
	}
	var payload any
	if json.Unmarshal(b.Payload, &payload) != nil {
		write(c, ErrInvalid)
		return
	}
	if e = h.publisher.Signal(c, v, a, b.Type, payload); e != nil {
		write(c, e)
		return
	}
	c.Status(204)
}

func StartWorkers(ctx context.Context, r *Repository, p *Publisher) {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			_ = r.Expire(ctx)
			_ = r.ExpireGroups(ctx)
			events, e := r.Pending(ctx)
			if e == nil {
				for _, event := range events {
					if p.publish(ctx, event) == nil {
						_ = r.Published(ctx, event.ID)
					}
				}
			}
			groupEvents, groupErr := r.PendingGroups(ctx)
			if groupErr == nil {
				for _, event := range groupEvents { if p.publishGroup(ctx, event) == nil { _ = r.PublishedGroup(ctx, event.ID) } }
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
