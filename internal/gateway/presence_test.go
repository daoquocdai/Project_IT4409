package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/daoquocdai/chat-api/internal/token"
	"github.com/daoquocdai/chat-api/internal/wsticket"
)

type presenceFrame struct {
	Type          string   `json:"type"`
	Revision      uint64   `json:"revision"`
	OnlineUserIDs []string `json:"online_user_ids"`
	UserID        string   `json:"user_id"`
	Online        bool     `json:"online"`
}

type socketFrame struct {
	frame presenceFrame
	err   error
}

type presenceSocket struct {
	conn   *websocket.Conn
	frames chan socketFrame
}

type presenceFixture struct {
	hub    *Hub
	jwt    *token.JWT
	server *httptest.Server
}

type presenceTickets struct{}

func (presenceTickets) Consume(_ context.Context, ticket string) (string, error) {
	if ticket == "valid-ticket" {
		return testPeerID, nil
	}
	return "", wsticket.ErrInvalidTicket
}

func newPresenceFixture(t *testing.T) *presenceFixture {
	t.Helper()
	hub := NewHub()
	hub.heartbeatInterval = time.Hour
	jwt, err := token.NewJWT("presence-test-secret", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(NewHandler(hub, jwt, presenceTickets{}, nil))
	t.Cleanup(func() {
		select {
		case <-hub.Stop():
		case <-time.After(3 * time.Second):
			t.Error("Hub shutdown did not finish")
		}
		server.Close()
	})
	return &presenceFixture{hub: hub, jwt: jwt, server: server}
}

func (f *presenceFixture) dial(userID string, read bool) (*presenceSocket, error) {
	jwt, err := f.jwt.Create(userID)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(f.server.URL, "http"), &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": []string{"Bearer " + jwt}},
	})
	if err != nil {
		return nil, err
	}
	socket := &presenceSocket{conn: conn, frames: make(chan socketFrame, 128)}
	if read {
		go socket.read()
	}
	return socket, nil
}

func (f *presenceFixture) connect(t *testing.T, userID string) *presenceSocket {
	t.Helper()
	socket, err := f.dial(userID, true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = socket.conn.CloseNow() })
	return socket
}

func (s *presenceSocket) read() {
	for {
		_, data, err := s.conn.Read(context.Background())
		if err != nil {
			s.frames <- socketFrame{err: err}
			return
		}
		var frame presenceFrame
		err = json.Unmarshal(data, &frame)
		s.frames <- socketFrame{frame: frame, err: err}
	}
}

func (s *presenceSocket) next(t *testing.T) presenceFrame {
	t.Helper()
	select {
	case result := <-s.frames:
		if result.err != nil {
			t.Fatal(result.err)
		}
		return result.frame
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for presence frame")
		return presenceFrame{}
	}
}

func assertSnapshot(t *testing.T, got presenceFrame, revision uint64, ids ...string) {
	t.Helper()
	sort.Strings(ids)
	want := presenceFrame{Type: "presence.snapshot", Revision: revision, OnlineUserIDs: ids}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("snapshot = %+v, want %+v", got, want)
	}
}

func assertChanged(t *testing.T, got presenceFrame, revision uint64, userID string, online bool) {
	t.Helper()
	want := presenceFrame{Type: "presence.changed", Revision: revision, UserID: userID, Online: online}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("delta = %+v, want %+v", got, want)
	}
}

func presenceClients(hub *Hub, userID string) []*client {
	hub.mu.RLock()
	defer hub.mu.RUnlock()
	var clients []*client
	for c := range hub.clients[userID] {
		clients = append(clients, c)
	}
	return clients
}

func TestPresenceSocketLifecycle(t *testing.T) {
	f := newPresenceFixture(t)
	reader := f.connect(t, testReaderID)
	assertSnapshot(t, reader.next(t), 1, testReaderID)
	peer1 := f.connect(t, testPeerID)
	assertSnapshot(t, peer1.next(t), 2, testReaderID, testPeerID)
	assertChanged(t, reader.next(t), 2, testPeerID, true)
	peer2 := f.connect(t, testPeerID)
	assertSnapshot(t, peer2.next(t), 2, testReaderID, testPeerID)
	peers := presenceClients(f.hub, testPeerID)
	if len(peers) != 2 {
		t.Fatalf("peer socket count = %d, want 2", len(peers))
	}
	f.hub.remove(peers[0])
	if len(presenceClients(f.hub, testPeerID)) != 1 {
		t.Fatal("closing one tab removed the other tab")
	}
	f.hub.remove(peers[1])
	assertChanged(t, reader.next(t), 3, testPeerID, false)
	var cleanup sync.WaitGroup
	for range 12 {
		cleanup.Go(func() {
			f.hub.remove(peers[0])
			f.hub.remove(peers[1])
		})
	}
	done := make(chan struct{})
	go func() { cleanup.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("repeated socket cleanup deadlocked")
	}
	thirdID := "33333333-3333-4333-8333-333333333333"
	third := f.connect(t, thirdID)
	assertSnapshot(t, third.next(t), 4, testReaderID, thirdID)
	// Receiving this exact next frame also proves second-tab registration,
	// partial closure and repeated cleanup emitted no redundant deltas.
	assertChanged(t, reader.next(t), 4, thirdID, true)
}

func TestPresenceConcurrentSnapshotAndChanges(t *testing.T) {
	f := newPresenceFixture(t)
	observer := f.connect(t, testReaderID)
	assertSnapshot(t, observer.next(t), 1, testReaderID)
	const count = 8
	var oldClients []*client
	for index := range count {
		id := fmt.Sprintf("%08d-0000-4000-8000-000000000001", index+10)
		socket := f.connect(t, id)
		frame := socket.next(t)
		if frame.Type != "presence.snapshot" || frame.Revision != uint64(index+2) {
			t.Fatalf("initial snapshot = %+v", frame)
		}
		assertChanged(t, observer.next(t), uint64(index+2), id, true)
		oldClients = append(oldClients, presenceClients(f.hub, id)[0])
	}
	type connectionResult struct {
		userID string
		socket *presenceSocket
		err    error
	}
	results := make(chan connectionResult, count)
	start := make(chan struct{})
	var operations sync.WaitGroup
	for index := range count {
		operations.Go(func() {
			<-start
			f.hub.remove(oldClients[index])
		})
		operations.Go(func() {
			<-start
			id := fmt.Sprintf("%08d-0000-4000-8000-000000000002", index+20)
			socket, err := f.dial(id, true)
			results <- connectionResult{userID: id, socket: socket, err: err}
		})
	}
	close(start)
	operations.Wait()
	close(results)
	finalRevision := uint64(1 + count*3)
	for revision := uint64(count + 2); revision <= finalRevision; revision++ {
		frame := observer.next(t)
		if frame.Type != "presence.changed" || frame.Revision != revision {
			t.Fatalf("concurrent observer frame = %+v, want delta revision %d", frame, revision)
		}
	}
	wantOnline := map[string]bool{testReaderID: true}
	var newSockets []connectionResult
	for result := range results {
		if result.err != nil {
			t.Fatal(result.err)
		}
		t.Cleanup(func() { _ = result.socket.conn.CloseNow() })
		wantOnline[result.userID] = true
		newSockets = append(newSockets, result)
	}
	for _, result := range newSockets {
		first := result.socket.next(t)
		if first.Type != "presence.snapshot" || first.Revision > finalRevision {
			t.Fatalf("new connection's first frame = %+v", first)
		}
		online := make(map[string]bool)
		for _, id := range first.OnlineUserIDs {
			online[id] = true
		}
		if !online[result.userID] {
			t.Fatal("snapshot omitted its newly registered user")
		}
		for revision := first.Revision + 1; revision <= finalRevision; revision++ {
			frame := result.socket.next(t)
			if frame.Type != "presence.changed" || frame.Revision != revision {
				t.Fatalf("new socket frame = %+v, want delta revision %d", frame, revision)
			}
			if frame.Online {
				online[frame.UserID] = true
			} else {
				delete(online, frame.UserID)
			}
		}
		if !reflect.DeepEqual(online, wantOnline) {
			t.Fatalf("snapshot plus concurrent deltas = %v, want %v", online, wantOnline)
		}
	}
}

func TestPresenceMissingPongRemovesLastSocket(t *testing.T) {
	f := newPresenceFixture(t)
	f.hub.pingInterval = 20 * time.Millisecond
	f.hub.pongTimeout = 30 * time.Millisecond
	observer := f.connect(t, testReaderID)
	assertSnapshot(t, observer.next(t), 1, testReaderID)
	silent, err := f.dial(testPeerID, false) // No Read means no control Pong.
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = silent.conn.CloseNow() })
	assertChanged(t, observer.next(t), 2, testPeerID, true)
	assertChanged(t, observer.next(t), 3, testPeerID, false)
	if len(presenceClients(f.hub, testPeerID)) != 0 || len(presenceClients(f.hub, testReaderID)) != 1 {
		t.Fatal("Ping timeout removed the wrong sockets")
	}
}

// These sockets use real upgraded connections but intentionally have no writer,
// making queue saturation deterministic without a network timing dependency.
func queuedPresenceClient(t *testing.T, hub *Hub, userID string, capacity int) (*client, *websocket.Conn) {
	t.Helper()
	accepted := make(chan *websocket.Conn, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err == nil {
			accepted <- conn
		}
	}))
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	remote, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	local := <-accepted
	t.Cleanup(func() { _ = remote.CloseNow(); _ = local.CloseNow() })
	c := &client{userID: userID, conn: local, send: make(chan []byte, capacity), done: make(chan struct{})}
	hub.clients[userID] = map[*client]struct{}{c: {}}
	hub.presenceRevision++
	return c, remote
}

func TestPresenceOverflowClosesSocketAndPublishesOffline(t *testing.T) {
	hub := NewHub()
	slow, remote := queuedPresenceClient(t, hub, testReaderID, 1)
	watcher, _ := queuedPresenceClient(t, hub, testPeerID, queueSize)
	slow.send <- []byte("already full")
	hub.queueTo(testReaderID, []byte("overflow"))
	select {
	case <-slow.done:
	default:
		t.Fatal("overflowed socket was left connected")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, _, err := remote.Read(ctx); err == nil {
		t.Fatal("overflow did not close the WebSocket")
	}
	var frame presenceFrame
	if err := json.Unmarshal(<-watcher.send, &frame); err != nil {
		t.Fatal(err)
	}
	assertChanged(t, frame, 3, testReaderID, false)
	hub.remove(slow)
	if len(watcher.send) != 0 {
		t.Fatal("repeated overflow cleanup emitted another offline delta")
	}
	select {
	case <-hub.Stop():
	case <-time.After(2 * time.Second):
		t.Fatal("shutdown after overflow deadlocked")
	}
}

func TestPresenceOverflowCascadeAndConcurrentShutdown(t *testing.T) {
	for _, shutdown := range []bool{false, true} {
		t.Run(fmt.Sprintf("shutdown=%t", shutdown), func(t *testing.T) {
			hub := NewHub()
			var clients []*client
			for index := range 3 {
				id := fmt.Sprintf("%08d-0000-4000-8000-000000000003", index+30)
				c, _ := queuedPresenceClient(t, hub, id, 1)
				c.send <- []byte("already full")
				clients = append(clients, c)
			}
			finished := make(chan struct{})
			go func() {
				var cleanup sync.WaitGroup
				for range 6 {
					cleanup.Go(func() { hub.remove(clients[0]) })
				}
				if shutdown {
					<-hub.Stop()
				}
				cleanup.Wait()
				<-hub.Stop()
				close(finished)
			}()
			select {
			case <-finished:
			case <-time.After(2 * time.Second):
				t.Fatal("overflow cleanup or shutdown deadlocked")
			}
			for _, c := range clients {
				select {
				case <-c.done:
				default:
					t.Fatal("slow socket survived cleanup")
				}
			}
			if len(hub.clients) != 0 || hub.presenceRevision != 6 {
				t.Fatalf("cleanup state = %d users at revision %d", len(hub.clients), hub.presenceRevision)
			}
		})
	}
}

func TestPresenceRequiresAuthenticationAndUpgrade(t *testing.T) {
	f := newPresenceFixture(t)
	observer := f.connect(t, testReaderID)
	assertSnapshot(t, observer.next(t), 1, testReaderID)
	invalidIDJWT, _ := f.jwt.Create("invalid-user-id")
	nilIDJWT, _ := f.jwt.Create("00000000-0000-0000-0000-000000000000")
	validJWT, _ := f.jwt.Create(testPeerID)
	for _, test := range []struct {
		name, query, jwt, origin string
		status                   int
	}{
		{name: "missing credentials", status: http.StatusUnauthorized},
		{name: "invalid ticket", query: "?ticket=invalid", status: http.StatusUnauthorized},
		{name: "invalid JWT", jwt: "invalid", status: http.StatusUnauthorized},
		{name: "invalid JWT subject", jwt: invalidIDJWT, status: http.StatusUnauthorized},
		{name: "nil JWT subject", jwt: nilIDJWT, status: http.StatusUnauthorized},
		{name: "forbidden origin", jwt: validJWT, origin: "https://untrusted.example", status: http.StatusForbidden},
	} {
		t.Run(test.name, func(t *testing.T) {
			headers := make(http.Header)
			if test.jwt != "" {
				headers.Set("Authorization", "Bearer "+test.jwt)
			}
			if test.origin != "" {
				headers.Set("Origin", test.origin)
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			conn, response, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(f.server.URL, "http")+test.query, &websocket.DialOptions{HTTPHeader: headers})
			if conn != nil {
				_ = conn.CloseNow()
			}
			if err == nil || response == nil || response.StatusCode != test.status {
				t.Fatalf("rejected handshake = %v, response=%v", err, response)
			}
		})
	}
	request, _ := http.NewRequest(http.MethodGet, f.server.URL, nil)
	request.Header.Set("Authorization", "Bearer "+validJWT)
	response, err := f.server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusUpgradeRequired {
		t.Fatalf("non-upgrade request status = %d", response.StatusCode)
	}
	f.hub.mu.RLock()
	users, revision := len(f.hub.clients), f.hub.presenceRevision
	f.hub.mu.RUnlock()
	if users != 1 || revision != 1 {
		t.Fatalf("failed authentication/upgrade changed presence: %d users at revision %d", users, revision)
	}
	// A successful ticket upgrade still uses the same authenticated lifecycle.
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(f.server.URL, "http")+"?ticket=valid-ticket", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	_, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var snapshot presenceFrame
	if err := json.Unmarshal(data, &snapshot); err != nil {
		t.Fatal(err)
	}
	assertSnapshot(t, snapshot, 2, testReaderID, testPeerID)
	assertChanged(t, observer.next(t), 2, testPeerID, true)
}

type waitingPresenceTicket struct{ started chan struct{} }

func (ticket waitingPresenceTicket) Consume(ctx context.Context, _ string) (string, error) {
	close(ticket.started)
	<-ctx.Done()
	return "", ctx.Err()
}

func TestPresenceShutdownWaitsForAuthenticatingHandler(t *testing.T) {
	hub := NewHub()
	ticket := waitingPresenceTicket{started: make(chan struct{})}
	server := httptest.NewServer(NewHandler(hub, nil, ticket, nil))
	defer server.Close()
	requestDone := make(chan struct{})
	go func() {
		defer close(requestDone)
		response, err := server.Client().Get(server.URL + "?ticket=waiting")
		if err == nil {
			_ = response.Body.Close()
		}
	}()
	select {
	case <-ticket.started:
	case <-time.After(2 * time.Second):
		t.Fatal("authentication did not start")
	}
	select {
	case <-hub.Stop():
	case <-time.After(2 * time.Second):
		t.Fatal("shutdown did not cancel and wait for authentication")
	}
	<-requestDone
	if hub.begin() || hub.add(testReaderID, nil) != nil {
		t.Fatal("shutdown accepted another handler or socket")
	}
	if len(hub.clients) != 0 || hub.presenceRevision != 0 {
		t.Fatal("authentication during shutdown created presence")
	}
}
