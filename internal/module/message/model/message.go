package model

import "time"

type Message struct {
	ID               int64
	ExternalID       string
	ThreadExternalID string
	ThreadKind       string
	SenderExternalID string
	Seq              int64
	Kind             string
	ContentFormat    string
	Content          string
	RecalledAt       *time.Time
	CreatedAt        time.Time
}

type Recall struct {
	EventID      string
	ChangeSeq    int64
	MessageID    string
	ThreadID     string
	SenderID     string
	MessageSeq   int64
	RecalledAt   time.Time
	RecipientIDs []string
}

type ChangePage struct {
	Changes    []Recall
	NextCursor int64
}

type Page struct {
	Messages   []Message
	NextCursor *int64
}
