package publisher

import (
	"context"
	"errors"
	"reflect"
	"testing"

	threadevent "github.com/daoquocdai/chat-api/internal/module/thread/event"
	"github.com/redis/go-redis/v9"
)

type fakeXAdder struct {
	ctx  context.Context
	args *redis.XAddArgs
	err  error
}

func (f *fakeXAdder) XAdd(ctx context.Context, args *redis.XAddArgs) *redis.StringCmd {
	f.ctx, f.args = ctx, args
	cmd := redis.NewStringCmd(ctx)
	cmd.SetVal("1-0")
	cmd.SetErr(f.err)
	return cmd
}

func TestPublishThreadUpdated(t *testing.T) {
	for _, publishErr := range []error{nil, errors.New("Redis unavailable")} {
		client := &fakeXAdder{err: publishErr}
		ctx := context.Background()
		event := threadevent.ThreadUpdated{ThreadID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", RecipientIDs: []string{"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"}}
		err := NewRedis(client, "existing-stream").Publish(ctx, event)
		if !errors.Is(err, publishErr) {
			t.Fatalf("error = %v, want %v", err, publishErr)
		}
		want := map[string]any{
			"event": "thread.updated", "thread_id": event.ThreadID,
			"recipient_ids": `["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"]`,
		}
		if client.ctx != ctx || client.args.Stream != "existing-stream" || !reflect.DeepEqual(client.args.Values, want) {
			t.Fatalf("published entry = %+v", client.args)
		}
	}
}
