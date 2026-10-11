package publisher

import (
	"context"
	"encoding/json"

	threadevent "github.com/daoquocdai/chat-api/internal/module/thread/event"
	"github.com/redis/go-redis/v9"
)

type xAdder interface {
	XAdd(context.Context, *redis.XAddArgs) *redis.StringCmd
}

type Redis struct {
	client xAdder
	stream string
}

func NewRedis(client xAdder, stream string) *Redis {
	return &Redis{client: client, stream: stream}
}

func (p *Redis) Publish(ctx context.Context, event threadevent.ThreadUpdated) error {
	recipients, err := json.Marshal(event.RecipientIDs)
	if err != nil {
		return err
	}
	return p.client.XAdd(ctx, &redis.XAddArgs{
		Stream: p.stream,
		Values: map[string]any{
			"event": threadevent.ThreadUpdatedType, "thread_id": event.ThreadID,
			"recipient_ids": string(recipients),
		},
	}).Err()
}
