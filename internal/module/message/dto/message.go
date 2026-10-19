package dto

import (
	"time"

	"github.com/daoquocdai/chat-api/internal/module/message/model"
)

type SendMessageRequest struct {
	MessageID     string   `json:"message_id"`
	ContentFormat string   `json:"content_format"`
	Content       string   `json:"content"`
	AttachmentIDs []string `json:"attachment_ids,omitempty"`
}

type MessageResponse struct {
	ID            string     `json:"id"`
	ThreadID      string     `json:"thread_id"`
	SenderID      string     `json:"sender_id"`
	Seq           int64      `json:"seq"`
	Kind          string     `json:"kind"`
	ContentFormat string     `json:"content_format"`
	Content       string     `json:"content"`
	RecalledAt    *time.Time `json:"recalled_at"`
	CreatedAt     time.Time  `json:"created_at"`
}

type MessagePageResponse struct {
	Messages   []MessageResponse `json:"messages"`
	NextCursor *int64            `json:"next_cursor"`
}

func ToMessageResponse(message model.Message) MessageResponse {
	return MessageResponse{
		ID:            message.ExternalID,
		ThreadID:      message.ThreadExternalID,
		SenderID:      message.SenderExternalID,
		Seq:           message.Seq,
		Kind:          message.Kind,
		ContentFormat: message.ContentFormat,
		Content:       message.Content,
		RecalledAt:    message.RecalledAt,
		CreatedAt:     message.CreatedAt,
	}
}

type RecallResponse struct {
	MessageID  string    `json:"message_id"`
	ThreadID   string    `json:"thread_id"`
	RecalledAt time.Time `json:"recalled_at"`
	ChangeSeq  int64     `json:"change_seq"`
}

type ChangeResponse struct {
	Type       string    `json:"type"`
	EventID    string    `json:"event_id"`
	MessageID  string    `json:"message_id"`
	ThreadID   string    `json:"thread_id"`
	SenderID   string    `json:"sender_id"`
	RecalledAt time.Time `json:"recalled_at"`
	ChangeSeq  int64     `json:"change_seq"`
}

type ChangePageResponse struct {
	Changes    []ChangeResponse `json:"changes"`
	NextCursor int64            `json:"next_cursor"`
}

func ToRecallResponse(recall model.Recall) RecallResponse {
	return RecallResponse{MessageID: recall.MessageID, ThreadID: recall.ThreadID, RecalledAt: recall.RecalledAt, ChangeSeq: recall.ChangeSeq}
}

func ToChangePageResponse(page model.ChangePage) ChangePageResponse {
	changes := make([]ChangeResponse, len(page.Changes))
	for i, change := range page.Changes {
		changes[i] = ChangeResponse{Type: "message.recalled", EventID: change.EventID, MessageID: change.MessageID,
			ThreadID: change.ThreadID, SenderID: change.SenderID, RecalledAt: change.RecalledAt, ChangeSeq: change.ChangeSeq}
	}
	return ChangePageResponse{Changes: changes, NextCursor: page.NextCursor}
}

func ToMessageResponses(messages []model.Message) []MessageResponse {
	responses := make([]MessageResponse, len(messages))
	for i, message := range messages {
		responses[i] = ToMessageResponse(message)
	}

	return responses
}

func ToMessagePageResponse(page model.Page) MessagePageResponse {
	return MessagePageResponse{
		Messages:   ToMessageResponses(page.Messages),
		NextCursor: page.NextCursor,
	}
}
