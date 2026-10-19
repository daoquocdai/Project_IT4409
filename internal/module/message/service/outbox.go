package service

import (
	"context"
	"log"
	"time"

	messageevent "github.com/daoquocdai/chat-api/internal/module/message/event"
	"github.com/daoquocdai/chat-api/internal/module/message/model"
)

type RecallOutboxRepository interface {
	PendingRecallEvents(context.Context, int) ([]model.Recall, error)
	MarkRecallPublished(context.Context, string) error
}

type RecallPublisher interface {
	PublishRecall(context.Context, messageevent.MessageRecalled) error
}

func StartRecallOutbox(ctx context.Context, repository RecallOutboxRepository, publisher RecallPublisher, timeout time.Duration) {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			publishRecallBatch(ctx, repository, publisher, timeout)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func publishRecallBatch(ctx context.Context, repository RecallOutboxRepository, publisher RecallPublisher, timeout time.Duration) {
	events, err := repository.PendingRecallEvents(ctx, 100)
	if err != nil {
		if ctx.Err() == nil {
			log.Printf("recall outbox load: %v", err)
		}
		return
	}
	for _, item := range events {
		publishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
		err := publisher.PublishRecall(publishCtx, messageevent.MessageRecalled{EventID: item.EventID, ChangeSeq: item.ChangeSeq,
			MessageID: item.MessageID, ThreadID: item.ThreadID, SenderID: item.SenderID, RecipientIDs: item.RecipientIDs, RecalledAt: item.RecalledAt})
		cancel()
		if err != nil {
			log.Printf("recall outbox publish event_id=%s: %v", item.EventID, err)
			return
		}
		if err := repository.MarkRecallPublished(ctx, item.EventID); err != nil {
			log.Printf("recall outbox mark event_id=%s: %v", item.EventID, err)
			return
		}
	}
}
