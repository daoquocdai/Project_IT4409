package call

import "time"

type GroupParticipant struct {
	SessionID string `json:"session_id"`
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
}

type GroupCall struct {
	ID, ThreadID, CreatedBy, CreatorName, MediaType, Status string
	Version                                                int64
	CreatedAt                                              time.Time
	EndedAt                                                *time.Time
	Participants                                           []GroupParticipant
}

type GroupJoin struct {
	GroupCall
	SelfSessionID string `json:"self_session_id"`
}

type GroupEvent struct {
	ID, Type   string
	Call       GroupCall
	Recipients []string
}

var ErrFull = errorString("group call is full")
