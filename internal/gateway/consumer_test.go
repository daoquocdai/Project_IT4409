package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"reflect"
	"testing"
	"time"

	messageevent "github.com/daoquocdai/chat-api/internal/module/message/event"
	threadevent "github.com/daoquocdai/chat-api/internal/module/thread/event"
	"github.com/redis/go-redis/v9"
)

const testThreadID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const testReaderID = "11111111-1111-4111-8111-111111111111"
const testPeerID = "22222222-2222-4222-8222-222222222222"

func threadUpdatedValues() map[string]any {
	return map[string]any{"event": "thread.updated", "thread_id": testThreadID, "recipient_ids": `["` + testReaderID + `","` + testPeerID + `","` + testReaderID + `"]`}
}

func messageCreatedValues() map[string]any {
	return map[string]any{
		"event": "message.created", "message_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "thread_id": testThreadID,
		"sender_id": testReaderID, "recipient_ids": `["` + testReaderID + `","` + testPeerID + `"]`,
		"thread_kind": "group", "seq": "3", "kind": "text", "content_format": "plaintext", "content": "",
		"created_at": "2026-10-11T08:00:00Z",
	}
}

func TestDecodeThreadUpdated(t *testing.T) {
	got, err := decode(threadUpdatedValues())
	want := &threadevent.ThreadUpdated{ThreadID: testThreadID, RecipientIDs: []string{testReaderID, testPeerID}}
	if err != nil || !reflect.DeepEqual(got.threadUpdated, want) || got.messageCreated.MessageID != "" {
		t.Fatalf("decoded notification = %+v, error = %v", got, err)
	}
	for _, tc := range []struct {
		name, field string
		value       any
	}{
		{"missing thread", "thread_id", nil},
		{"invalid thread UUID", "thread_id", "wrong"},
		{"zero thread UUID", "thread_id", "00000000-0000-0000-0000-000000000000"},
		{"noncanonical thread UUID", "thread_id", "urn:uuid:" + testThreadID},
		{"missing recipients", "recipient_ids", nil},
		{"invalid recipients JSON", "recipient_ids", "wrong"},
		{"null recipients", "recipient_ids", "null"},
		{"empty recipients", "recipient_ids", "[]"},
		{"wrong recipients type", "recipient_ids", []string{testReaderID}},
		{"invalid recipient UUID", "recipient_ids", `["` + testReaderID + `","wrong"]`},
		{"zero recipient UUID", "recipient_ids", `["00000000-0000-0000-0000-000000000000"]`},
		{"numeric recipient", "recipient_ids", `[123]`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			values := threadUpdatedValues()
			values[tc.field] = tc.value
			if _, err := decode(values); err == nil {
				t.Fatal("invalid notification accepted")
			}
		})
	}
}

func TestDecodeMessageCreatedCompatibility(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		values := messageCreatedValues()
		wantRecipients := []string{testReaderID, testPeerID}
		wantKind := "group"
		if legacy {
			delete(values, "recipient_ids")
			delete(values, "thread_kind")
			values["recipient_id"] = testPeerID
			wantRecipients, wantKind = []string{testPeerID}, "direct"
		}
		got, err := decode(values)
		want := messageevent.MessageCreated{
			MessageID: values["message_id"].(string), ThreadID: testThreadID, ThreadKind: wantKind, SenderID: testReaderID,
			RecipientIDs: wantRecipients, Seq: 3, Kind: "text", ContentFormat: "plaintext", Content: "",
			CreatedAt: time.Date(2026, 10, 11, 8, 0, 0, 0, time.UTC),
		}
		if err != nil || got.threadUpdated != nil || !reflect.DeepEqual(got.messageCreated, want) {
			t.Fatalf("legacy=%v decoded = %+v, error=%v", legacy, got, err)
		}
	}
	for _, field := range []string{"message_id", "seq", "content", "created_at", "sender_id"} {
		values := messageCreatedValues()
		delete(values, field)
		if _, err := decode(values); err == nil {
			t.Fatalf("message accepted without %s", field)
		}
	}
	for _, seq := range []string{"0", "-1", "wrong"} {
		values := messageCreatedValues()
		values["seq"] = seq
		if _, err := decode(values); err == nil {
			t.Fatalf("message accepted with seq %q", seq)
		}
	}
}

type ackClient struct {
	redis.Cmdable
	acked []string
	err   error
	onAck func()
}

func (c *ackClient) XAck(ctx context.Context, stream, group string, ids ...string) *redis.IntCmd {
	if c.onAck != nil {
		c.onAck()
	}
	c.acked = append(c.acked, ids...)
	cmd := redis.NewIntCmd(ctx)
	cmd.SetVal(int64(len(ids)))
	cmd.SetErr(c.err)
	return cmd
}

func queueClient() *client {
	return &client{send: make(chan []byte, queueSize), done: make(chan struct{})}
}

func TestHandleStreamsNotificationFanoutAndACK(t *testing.T) {
	hub := NewHub()
	readerTab1, readerTab2, peer, outsider := queueClient(), queueClient(), queueClient(), queueClient()
	hub.clients[testReaderID] = map[*client]struct{}{readerTab1: {}, readerTab2: {}}
	hub.clients[testPeerID] = map[*client]struct{}{peer: {}}
	hub.clients["33333333-3333-4333-8333-333333333333"] = map[*client]struct{}{outsider: {}}
	redisClient := &ackClient{onAck: func() {
		if len(readerTab1.send) != 1 || len(readerTab2.send) != 1 || len(peer.send) != 1 {
			t.Fatal("ACK happened before every connection received its queued notification")
		}
	}}
	consumer := NewConsumer(redisClient, hub, "existing-stream", DefaultGroup, DefaultConsumer, log.New(io.Discard, "", 0))
	entries := []redis.XStream{{Stream: "existing-stream", Messages: []redis.XMessage{{ID: "1-0", Values: threadUpdatedValues()}}}}
	if err := consumer.handleStreams(context.Background(), entries); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(redisClient.acked, []string{"1-0"}) || len(outsider.send) != 0 {
		t.Fatal("notification ACK or recipient scope changed")
	}
	for _, recipient := range []struct {
		client *client
		id     string
	}{{readerTab1, testReaderID}, {readerTab2, testReaderID}, {peer, testPeerID}} {
		var frame map[string]any
		if err := json.Unmarshal(<-recipient.client.send, &frame); err != nil {
			t.Fatal(err)
		}
		want := map[string]any{"type": "thread.updated", "thread_id": testThreadID, "recipient_id": recipient.id}
		if !reflect.DeepEqual(frame, want) || len(recipient.client.send) != 0 {
			t.Fatalf("notification frame = %v, want %v", frame, want)
		}
	}
}

func TestHandleStreamsPoisonACKAndCancellation(t *testing.T) {
	redisClient := &ackClient{}
	consumer := NewConsumer(redisClient, NewHub(), "stream", DefaultGroup, DefaultConsumer, log.New(io.Discard, "", 0))
	entries := []redis.XStream{{Messages: []redis.XMessage{{ID: "1-0", Values: map[string]any{"event": "thread.updated"}}}}}
	if err := consumer.handleStreams(context.Background(), entries); err != nil || !reflect.DeepEqual(redisClient.acked, []string{"1-0"}) {
		t.Fatalf("poison ACK = %v, error=%v", redisClient.acked, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := consumer.handleStreams(ctx, entries); !errors.Is(err, context.Canceled) || len(redisClient.acked) != 1 {
		t.Fatal("canceled stream processing acknowledged an unprocessed entry")
	}
	redisClient.err = errors.New("ACK failed")
	if err := consumer.handleStreams(context.Background(), entries); !errors.Is(err, redisClient.err) {
		t.Fatal("ACK failure was ignored")
	}
}

func TestDispatchMessageCreatedPayload(t *testing.T) {
	hub := NewHub()
	reader, peer := queueClient(), queueClient()
	hub.clients[testReaderID] = map[*client]struct{}{reader: {}}
	hub.clients[testPeerID] = map[*client]struct{}{peer: {}}
	decoded, err := decode(messageCreatedValues())
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.Dispatch(decoded.messageCreated); err != nil {
		t.Fatal(err)
	}
	for _, recipient := range []struct {
		client *client
		id     string
	}{{reader, testReaderID}, {peer, testPeerID}} {
		var frame map[string]any
		if err := json.Unmarshal(<-recipient.client.send, &frame); err != nil {
			t.Fatal(err)
		}
		want := map[string]any{
			"type": "message.created", "message_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "thread_id": testThreadID,
			"thread_kind": "group", "sender_id": testReaderID, "recipient_id": recipient.id, "seq": float64(3),
			"kind": "text", "content_format": "plaintext", "content": "", "created_at": "2026-10-11T08:00:00Z",
		}
		if !reflect.DeepEqual(frame, want) {
			t.Fatalf("message frame = %v, want %v", frame, want)
		}
	}
}
