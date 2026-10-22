package call

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func groupResponse(v GroupCall) map[string]any {
	return map[string]any{"id": v.ID, "thread_id": v.ThreadID, "created_by": v.CreatedBy, "creator_name": v.CreatorName, "media_type": v.MediaType, "status": v.Status, "version": v.Version, "created_at": v.CreatedAt, "ended_at": v.EndedAt, "participants": v.Participants}
}
func groupJoinResponse(v GroupJoin) map[string]any {
	out := groupResponse(v.GroupCall)
	out["self_session_id"] = v.SelfSessionID
	out["ice_servers"] = []map[string]any{{"urls": []string{"stun:stun.l.google.com:19302"}}}
	return out
}
func deviceID(r http.Header) (string, bool) { value := strings.TrimSpace(r.Get("X-Device-ID")); id, err := uuid.Parse(value); return value, err == nil && id != uuid.Nil }

func (h *Handler) CreateGroupCall(c *gin.Context) { a, _ := actor(c); var b struct{ MediaType string `json:"mediaType"` }; if c.ShouldBindJSON(&b) != nil { write(c, ErrInvalid); return }; v, created, e := h.repository.CreateGroupCall(c, a, c.Param("id"), b.MediaType); if e != nil { write(c, e); return }; code := http.StatusOK; if created { code = http.StatusCreated }; c.JSON(code, groupResponse(v)) }
func (h *Handler) ActiveGroupCall(c *gin.Context) { a, _ := actor(c); v, e := h.repository.ActiveGroupCall(c, a, c.Param("id")); if e != nil { write(c, e); return }; c.JSON(200, groupResponse(v)) }
func (h *Handler) GetGroupCall(c *gin.Context) { a, _ := actor(c); v, e := h.repository.GetGroupCall(c, a, c.Param("id")); if e != nil { write(c, e); return }; c.JSON(200, groupResponse(v)) }
func (h *Handler) JoinGroupCall(c *gin.Context) { a, _ := actor(c); device, ok := deviceID(c.Request.Header); if !ok { write(c, ErrInvalid); return }; v, e := h.repository.JoinGroupCall(c, a, c.Param("id"), device); if e != nil { write(c, e); return }; c.JSON(200, groupJoinResponse(v)) }
func (h *Handler) ReadyGroupCall(c *gin.Context) { a, _ := actor(c); device, ok := deviceID(c.Request.Header); var b struct{ SessionID string `json:"sessionId"` }; if !ok || c.ShouldBindJSON(&b) != nil { write(c, ErrInvalid); return }; v, e := h.repository.ReadyGroupCall(c, a, c.Param("id"), b.SessionID, device); if e != nil { write(c, e); return }; c.JSON(200, groupJoinResponse(v)) }
func (h *Handler) LeaveGroupCall(c *gin.Context) { a, _ := actor(c); device, ok := deviceID(c.Request.Header); var b struct{ SessionID string `json:"sessionId"` }; if !ok || c.ShouldBindJSON(&b) != nil { write(c, ErrInvalid); return }; v, e := h.repository.LeaveGroupCall(c, a, c.Param("id"), b.SessionID, device); if e != nil { write(c, e); return }; c.JSON(200, groupResponse(v)) }
func (h *Handler) EndGroupCall(c *gin.Context) { a, _ := actor(c); v, e := h.repository.EndGroupCall(c, a, c.Param("id")); if e != nil { write(c, e); return }; c.JSON(200, groupResponse(v)) }
func (h *Handler) SignalGroupCall(c *gin.Context) {
	a, _ := actor(c); device, ok := deviceID(c.Request.Header)
	var b struct { Type string `json:"type"`; SourceSessionID string `json:"sourceSessionId"`; TargetSessionID string `json:"targetSessionId"`; Payload json.RawMessage `json:"payload"` }
	allowed := map[string]bool{"group-call.offer": true, "group-call.answer": true, "group-call.ice": true}
	if !ok || c.ShouldBindJSON(&b) != nil || !allowed[b.Type] || len(b.Payload) > 65536 { write(c, ErrInvalid); return }
	call, target, e := h.repository.ValidateGroupSignal(c, a, c.Param("id"), b.SourceSessionID, b.TargetSessionID, device); if e != nil { write(c, e); return }
	var payload any; if json.Unmarshal(b.Payload, &payload) != nil { write(c, ErrInvalid); return }
	if e = h.publisher.GroupSignal(c, call, a, target, b.SourceSessionID, b.TargetSessionID, b.Type, payload); e != nil { write(c, e); return }; c.Status(204)
}
