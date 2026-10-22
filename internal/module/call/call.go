package call

import "time"

type Call struct {
	ID, ThreadID, CallerID, CalleeID, CallerName string
	MediaType, Status, EndReason                 string
	CreatedAt, RingExpiresAt                     time.Time
	AcceptedAt, ConnectedAt, EndedAt             *time.Time
}

type Event struct {
	ID, Type   string
	Call       Call
	Recipients []string
}

var (
	ErrNotFound  = errorString("call not found")
	ErrForbidden = errorString("call operation forbidden")
	ErrBusy      = errorString("user is already in another call")
	ErrInvalid   = errorString("invalid call request")
	ErrConflict  = errorString("call state conflict")
)

type errorString string

func (e errorString) Error() string { return string(e) }
