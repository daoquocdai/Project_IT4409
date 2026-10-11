package service_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	messagemodel "github.com/daoquocdai/chat-api/internal/module/message/model"
	threadevent "github.com/daoquocdai/chat-api/internal/module/thread/event"
	threadmodel "github.com/daoquocdai/chat-api/internal/module/thread/model"
	"github.com/daoquocdai/chat-api/internal/module/thread/service"
	usermodel "github.com/daoquocdai/chat-api/internal/module/user/model"
)

const (
	actorExternalID  = "11111111-1111-4111-8111-111111111111"
	peerExternalID   = "22222222-2222-4222-8222-222222222222"
	threadExternalID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
)

type fakeThreadRepository struct {
	createOrGet  func(context.Context, int64, int64) (threadmodel.Thread, bool, error)
	list         func(context.Context, int64) ([]threadmodel.Thread, error)
	markRead     func(context.Context, string, int64, int64) (threadmodel.ReadResult, error)
	createGroup  func(context.Context, int64, string, []int64, string) (threadmodel.Thread, messagemodel.Message, error)
	changeMember func(context.Context, string, int64, int64, threadmodel.MembershipAction, string) (messagemodel.Message, error)
	members      func(context.Context, string, int64) ([]threadmodel.Member, error)
	calls        int
}

func (r *fakeThreadRepository) CreateOrGetDirect(
	ctx context.Context,
	creatorID, peerID int64,
) (threadmodel.Thread, bool, error) {
	r.calls++
	return r.createOrGet(ctx, creatorID, peerID)
}

func (r *fakeThreadRepository) ListByUser(ctx context.Context, userID int64) ([]threadmodel.Thread, error) {
	r.calls++
	return r.list(ctx, userID)
}

func (r *fakeThreadRepository) MarkRead(
	ctx context.Context,
	threadID string,
	userID, lastReadSeq int64,
) (threadmodel.ReadResult, error) {
	r.calls++
	return r.markRead(ctx, threadID, userID, lastReadSeq)
}

type fakeUserFinder struct {
	get   func(context.Context, string) (usermodel.User, error)
	calls int
}

func (f *fakeUserFinder) GetByExternalID(
	ctx context.Context,
	externalID string,
) (usermodel.User, error) {
	f.calls++
	return f.get(ctx, externalID)
}

func TestCreateOrGetDirect(t *testing.T) {
	databaseError := errors.New("database unavailable")

	tests := []struct {
		name             string
		peerID           string
		actorLookupError error
		peerLookupError  error
		peerInternalID   int64
		repositoryError  error
		wantError        error
		wantUserCalls    int
		wantRepoCalls    int
	}{
		{name: "creates direct thread", peerID: "  " + peerExternalID + " ", peerInternalID: 22, wantUserCalls: 2, wantRepoCalls: 1},
		{name: "peer ID required", peerID: " \t", wantError: threadmodel.ErrPeerIDRequired},
		{name: "same external user", peerID: actorExternalID, wantError: threadmodel.ErrSameUser},
		{name: "actor lookup fails", peerID: peerExternalID, actorLookupError: databaseError, wantError: databaseError, wantUserCalls: 1},
		{name: "peer lookup fails", peerID: peerExternalID, peerLookupError: usermodel.ErrUserNotFound, wantError: usermodel.ErrUserNotFound, wantUserCalls: 2},
		{name: "same internal user", peerID: peerExternalID, peerInternalID: 11, wantError: threadmodel.ErrSameUser, wantUserCalls: 2},
		{name: "repository error", peerID: peerExternalID, peerInternalID: 22, repositoryError: databaseError, wantError: databaseError, wantUserCalls: 2, wantRepoCalls: 1},
		{name: "E2EE bundle required", peerID: peerExternalID, peerInternalID: 22, repositoryError: threadmodel.ErrE2EEBundleRequired, wantError: threadmodel.ErrE2EEBundleRequired, wantUserCalls: 2, wantRepoCalls: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			users := &fakeUserFinder{get: func(gotCtx context.Context, externalID string) (usermodel.User, error) {
				if gotCtx != ctx {
					t.Fatal("context was not passed to user finder")
				}
				switch externalID {
				case actorExternalID:
					if tt.actorLookupError != nil {
						return usermodel.User{}, tt.actorLookupError
					}
					return usermodel.User{ID: 11, ExternalID: actorExternalID}, nil
				case peerExternalID:
					if tt.peerLookupError != nil {
						return usermodel.User{}, tt.peerLookupError
					}
					return usermodel.User{ID: tt.peerInternalID, ExternalID: peerExternalID}, nil
				default:
					t.Fatalf("unexpected external ID %q", externalID)
					return usermodel.User{}, nil
				}
			}}

			wantThread := threadmodel.Thread{ID: 7, ExternalID: threadExternalID, Kind: "direct"}
			repository := &fakeThreadRepository{createOrGet: func(
				gotCtx context.Context,
				creatorID, peerID int64,
			) (threadmodel.Thread, bool, error) {
				if gotCtx != ctx {
					t.Fatal("context was not passed to repository")
				}
				if creatorID != 11 || peerID != 22 {
					t.Fatalf("user IDs = (%d, %d), want (11, 22)", creatorID, peerID)
				}
				return wantThread, true, tt.repositoryError
			}}

			got, created, err := service.New(repository, users, &fakeGroupPublisher{}, nil, time.Second).CreateOrGetDirect(
				ctx,
				actorExternalID,
				tt.peerID,
			)
			if !errors.Is(err, tt.wantError) {
				t.Fatalf("error = %v, want %v", err, tt.wantError)
			}
			if users.calls != tt.wantUserCalls {
				t.Fatalf("user calls = %d, want %d", users.calls, tt.wantUserCalls)
			}
			if repository.calls != tt.wantRepoCalls {
				t.Fatalf("repository calls = %d, want %d", repository.calls, tt.wantRepoCalls)
			}
			if tt.wantError == nil && (got != wantThread || !created) {
				t.Fatalf("result = (%+v, %v), want (%+v, true)", got, created, wantThread)
			}
		})
	}
}

func TestMarkRead(t *testing.T) {
	tests := []struct {
		name          string
		threadID      string
		lastReadSeq   int64
		repositoryErr error
		want          int64
		wantError     error
		wantRepoCalls int
	}{
		{name: "advances marker", threadID: " " + threadExternalID + " ", lastReadSeq: 5, want: 5, wantRepoCalls: 1},
		{name: "empty thread ID", threadID: " ", wantError: threadmodel.ErrThreadIDRequired},
		{name: "negative marker", threadID: threadExternalID, lastReadSeq: -1, wantError: threadmodel.ErrInvalidReadSequence},
		{name: "participant error is preserved", threadID: threadExternalID, lastReadSeq: 1, repositoryErr: threadmodel.ErrNotParticipant, wantError: threadmodel.ErrNotParticipant, wantRepoCalls: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			users := &fakeUserFinder{get: func(context.Context, string) (usermodel.User, error) {
				return usermodel.User{ID: 11, ExternalID: actorExternalID}, nil
			}}
			repository := &fakeThreadRepository{markRead: func(
				gotCtx context.Context,
				threadID string,
				userID, lastReadSeq int64,
			) (threadmodel.ReadResult, error) {
				if gotCtx != ctx || threadID != threadExternalID || userID != 11 || lastReadSeq != tt.lastReadSeq {
					t.Fatalf("unexpected MarkRead arguments: %q %d %d", threadID, userID, lastReadSeq)
				}
				return threadmodel.ReadResult{LastReadSeq: tt.want, ThreadExternalID: threadExternalID}, tt.repositoryErr
			}}

			got, err := service.New(repository, users, &fakeGroupPublisher{}, nil, time.Second).MarkRead(ctx, actorExternalID, tt.threadID, tt.lastReadSeq)
			if !errors.Is(err, tt.wantError) || got != tt.want {
				t.Fatalf("result = (%d, %v), want (%d, %v)", got, err, tt.want, tt.wantError)
			}
			if repository.calls != tt.wantRepoCalls {
				t.Fatalf("repository calls = %d, want %d", repository.calls, tt.wantRepoCalls)
			}
		})
	}
}

func (r *fakeThreadRepository) CreateGroup(ctx context.Context, actor int64, name string, members []int64, content string) (threadmodel.Thread, messagemodel.Message, error) {
	r.calls++
	return r.createGroup(ctx, actor, name, members, content)
}
func (r *fakeThreadRepository) ChangeMember(ctx context.Context, thread string, actor, target int64, action threadmodel.MembershipAction, content string) (messagemodel.Message, error) {
	r.calls++
	return r.changeMember(ctx, thread, actor, target, action, content)
}
func (r *fakeThreadRepository) ListMembers(ctx context.Context, thread string, actor int64) ([]threadmodel.Member, error) {
	r.calls++
	return r.members(ctx, thread, actor)
}

type fakeGroupPublisher struct {
	messages  []messagemodel.Message
	err       error
	onPublish func(context.Context, messagemodel.Message)
}

func (p *fakeGroupPublisher) PublishMessage(ctx context.Context, event messagemodel.Message) error {
	p.messages = append(p.messages, event)
	if p.onPublish != nil {
		p.onPublish(ctx, event)
	}
	if p.err != nil {
		return &messagemodel.EventPublishError{MessageID: event.ExternalID, ThreadID: event.ThreadExternalID, SenderID: event.SenderExternalID, Seq: event.Seq, Cause: p.err}
	}
	return nil
}

func TestCreateGroup(t *testing.T) {
	dbErr := errors.New("transaction rolled back")
	redisErr := errors.New("redis unavailable")
	cases := []struct {
		name, groupName              string
		ids                          []string
		repoErr, publishErr, wantErr error
		wantRepo, wantPublish        int
	}{
		{name: "creates group after normalization", groupName: "  nhóm học Go  ", ids: []string{" " + peerExternalID + " "}, wantRepo: 1, wantPublish: 1},
		{name: "empty name", groupName: " ", wantErr: threadmodel.ErrInvalidGroupName},
		{name: "long name", groupName: strings.Repeat("đ", 101), wantErr: threadmodel.ErrInvalidGroupName},
		{name: "NUL name", groupName: "go\x00", wantErr: threadmodel.ErrInvalidGroupName},
		{name: "invalid UTF8 name", groupName: string([]byte{0xff}), wantErr: threadmodel.ErrInvalidGroupName},
		{name: "duplicate members", groupName: "Go", ids: []string{peerExternalID, peerExternalID}, wantErr: threadmodel.ErrInvalidMemberIDs},
		{name: "blank member", groupName: "Go", ids: []string{" "}, wantErr: threadmodel.ErrInvalidMemberIDs},
		{name: "creator included twice", groupName: "Go", ids: []string{actorExternalID}, wantErr: threadmodel.ErrInvalidMemberIDs},
		{name: "rollback does not publish", groupName: "Go", repoErr: dbErr, wantErr: dbErr, wantRepo: 1},
		{name: "publish failure retains saved thread", groupName: "Go", publishErr: redisErr, wantErr: messagemodel.ErrEventPublishFailed, wantRepo: 1, wantPublish: 1},
		{name: "initial members too many", groupName: "Go", ids: make([]string, 100), wantErr: threadmodel.ErrGroupTooLarge},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			original := append([]string(nil), tc.ids...)
			users := &fakeUserFinder{get: func(_ context.Context, id string) (usermodel.User, error) {
				if id == actorExternalID {
					return usermodel.User{ID: 11, ExternalID: id, Username: "Alice"}, nil
				}
				if id == peerExternalID {
					return usermodel.User{ID: 22, ExternalID: id, Username: "Bob"}, nil
				}
				return usermodel.User{}, usermodel.ErrUserNotFound
			}}
			saved := threadmodel.Thread{ID: 7, ExternalID: threadExternalID, Kind: "group", Name: strings.TrimSpace(tc.groupName), Role: "admin"}
			system := messagemodel.Message{ExternalID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ThreadExternalID: threadExternalID, ThreadKind: "group", SenderExternalID: actorExternalID, Kind: "system", Seq: 1}
			order := []string{}
			repo := &fakeThreadRepository{createGroup: func(_ context.Context, actor int64, name string, ids []int64, content string) (threadmodel.Thread, messagemodel.Message, error) {
				order = append(order, "repository")
				if actor != 11 || name != strings.TrimSpace(tc.groupName) || content != "Alice đã tạo nhóm "+name {
					t.Fatalf("unexpected group args: %d %q %q", actor, name, content)
				}
				if len(tc.ids) > 0 && !reflect.DeepEqual(ids, []int64{22}) {
					t.Fatalf("members = %v", ids)
				}
				return saved, system, tc.repoErr
			}}
			publisher := &fakeGroupPublisher{err: tc.publishErr}
			publisher.onPublish = func(ctx context.Context, event messagemodel.Message) {
				order = append(order, "publisher")
				if !reflect.DeepEqual(event, system) {
					t.Fatalf("event = %+v", event)
				}
			}
			got, err := service.New(repo, users, publisher, nil, time.Second).CreateGroup(context.Background(), actorExternalID, tc.groupName, tc.ids)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			if repo.calls != tc.wantRepo || len(publisher.messages) != tc.wantPublish {
				t.Fatalf("calls = %d/%d", repo.calls, len(publisher.messages))
			}
			if tc.wantPublish == 1 && (got != saved || strings.Join(order, ",") != "repository,publisher") {
				t.Fatalf("saved result/order = %+v/%v", got, order)
			}
			if !reflect.DeepEqual(tc.ids, original) {
				t.Fatal("service mutated member list")
			}
		})
	}
}

func TestGroupMembership(t *testing.T) {
	cases := []struct {
		name               string
		action             threadmodel.MembershipAction
		repoErr, errorWant error
		targetID           string
		publishErr         error
	}{
		{name: "admin adds", action: threadmodel.AddMember, targetID: peerExternalID},
		{name: "admin removes", action: threadmodel.RemoveMember, targetID: peerExternalID},
		{name: "member leaves", action: threadmodel.LeaveGroup, targetID: actorExternalID},
		{name: "nonadmin rejected", action: threadmodel.AddMember, targetID: peerExternalID, repoErr: threadmodel.ErrAdminRequired, errorWant: threadmodel.ErrAdminRequired},
		{name: "outsider rejected", action: threadmodel.RemoveMember, targetID: peerExternalID, repoErr: threadmodel.ErrNotParticipant, errorWant: threadmodel.ErrNotParticipant},
		{name: "publish is retryable", action: threadmodel.AddMember, targetID: peerExternalID, publishErr: errors.New("redis unavailable"), errorWant: messagemodel.ErrEventPublishFailed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			users := &fakeUserFinder{get: func(_ context.Context, id string) (usermodel.User, error) {
				if id == actorExternalID {
					return usermodel.User{ID: 11, Username: "Alice"}, nil
				}
				return usermodel.User{ID: 22, Username: "Bob"}, nil
			}}
			saved := messagemodel.Message{ExternalID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ThreadExternalID: threadExternalID, ThreadKind: "group", Kind: "system", Seq: 9}
			repo := &fakeThreadRepository{changeMember: func(_ context.Context, thread string, actor, target int64, action threadmodel.MembershipAction, content string) (messagemodel.Message, error) {
				wantTarget := int64(22)
				if action == threadmodel.LeaveGroup {
					wantTarget = 11
				}
				if thread != threadExternalID || actor != 11 || target != wantTarget || action != tc.action || content == "" {
					t.Fatal("incorrect membership arguments")
				}
				return saved, tc.repoErr
			}}
			pub := &fakeGroupPublisher{err: tc.publishErr}
			svc := service.New(repo, users, pub, nil, time.Second)
			var got messagemodel.Message
			var err error
			switch tc.action {
			case threadmodel.AddMember:
				got, err = svc.AddMember(context.Background(), actorExternalID, " "+threadExternalID+" ", tc.targetID)
			case threadmodel.RemoveMember:
				got, err = svc.RemoveMember(context.Background(), actorExternalID, threadExternalID, tc.targetID)
			default:
				got, err = svc.Leave(context.Background(), actorExternalID, threadExternalID)
			}
			if !errors.Is(err, tc.errorWant) {
				t.Fatalf("error=%v want=%v", err, tc.errorWant)
			}
			wantPublish := 0
			if tc.repoErr == nil {
				wantPublish = 1
				if !reflect.DeepEqual(got, saved) {
					t.Fatal("lost saved message")
				}
			}
			if len(pub.messages) != wantPublish {
				t.Fatal("published before successful repository return")
			}
			if wantPublish == 1 && !reflect.DeepEqual(pub.messages[0], saved) {
				t.Fatal("membership operation lost the saved message")
			}
		})
	}
}

func TestGroupMembers(t *testing.T) {
	users := &fakeUserFinder{get: func(context.Context, string) (usermodel.User, error) { return usermodel.User{ID: 11}, nil }}
	repo := &fakeThreadRepository{members: func(_ context.Context, id string, actor int64) ([]threadmodel.Member, error) {
		if id != threadExternalID || actor != 11 {
			t.Fatal("incorrect membership lookup")
		}
		return nil, nil
	}}
	got, err := service.New(repo, users, &fakeGroupPublisher{}, nil, time.Second).Members(context.Background(), actorExternalID, threadExternalID)
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("members=%v error=%v", got, err)
	}
}

type fakeReadNotifier struct {
	events    []threadevent.ThreadUpdated
	err       error
	onPublish func(context.Context, threadevent.ThreadUpdated)
}

func (n *fakeReadNotifier) Publish(ctx context.Context, event threadevent.ThreadUpdated) error {
	n.events = append(n.events, event)
	if n.onPublish != nil {
		n.onPublish(ctx, event)
	}
	return n.err
}

func TestMarkReadNotifications(t *testing.T) {
	dbErr := errors.New("commit failed")
	for _, tc := range []struct {
		name         string
		peerID       string
		repoErr      error
		userErr      error
		publishErr   error
		cancelAtSave bool
		wantIDs      []string
	}{
		{name: "direct reaches reader and peer", peerID: peerExternalID, wantIDs: []string{actorExternalID, peerExternalID}},
		{name: "group reaches reader only", wantIDs: []string{actorExternalID}},
		{name: "duplicate recipient omitted", peerID: actorExternalID, wantIDs: []string{actorExternalID}},
		{name: "transaction failure does not publish", peerID: peerExternalID, repoErr: dbErr},
		{name: "outsider does not publish", repoErr: threadmodel.ErrNotParticipant},
		{name: "invalid sequence does not publish", repoErr: threadmodel.ErrInvalidReadSequence},
		{name: "actor lookup failure does not publish", userErr: usermodel.ErrUserNotFound},
		{name: "publish failure preserves committed marker", publishErr: errors.New("Redis unavailable"), wantIDs: []string{actorExternalID}},
		{name: "request cancellation after commit still publishes", cancelAtSave: true, wantIDs: []string{actorExternalID}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			type contextKey struct{}
			ctx, cancel := context.WithCancel(context.WithValue(context.Background(), contextKey{}, "request value"))
			defer cancel()
			users := &fakeUserFinder{get: func(context.Context, string) (usermodel.User, error) {
				return usermodel.User{ID: 11, ExternalID: actorExternalID}, tc.userErr
			}}
			order := []string{}
			repo := &fakeThreadRepository{markRead: func(gotCtx context.Context, id string, userID, seq int64) (threadmodel.ReadResult, error) {
				order = append(order, "repository")
				if gotCtx != ctx || id != threadExternalID || userID != 11 || seq != 3 {
					t.Fatal("incorrect read arguments")
				}
				if tc.cancelAtSave {
					cancel()
				}
				// A retry may return an already advanced committed marker.
				return threadmodel.ReadResult{LastReadSeq: 7, ThreadExternalID: threadExternalID, PeerExternalID: tc.peerID}, tc.repoErr
			}}
			notifier := &fakeReadNotifier{err: tc.publishErr, onPublish: func(gotCtx context.Context, event threadevent.ThreadUpdated) {
				order = append(order, "notifier")
				if gotCtx.Err() != nil || gotCtx.Value(contextKey{}) != "request value" {
					t.Fatal("notification lost request values or inherited cancellation")
				}
				deadline, ok := gotCtx.Deadline()
				if !ok || time.Until(deadline) <= 0 || time.Until(deadline) > time.Second {
					t.Fatal("notification does not use configured timeout")
				}
			}}
			got, err := service.New(repo, users, &fakeGroupPublisher{}, notifier, time.Second).MarkRead(ctx, actorExternalID, " "+threadExternalID+" ", 3)
			wantErr := tc.repoErr
			if tc.userErr != nil {
				wantErr = tc.userErr
			}
			if !errors.Is(err, wantErr) {
				t.Fatalf("error = %v, want %v", err, wantErr)
			}
			if wantErr != nil {
				if got != 0 || len(notifier.events) != 0 {
					t.Fatal("unsaved marker returned or notified")
				}
				return
			}
			if got != 7 || len(notifier.events) != 1 || strings.Join(order, ",") != "repository,notifier" {
				t.Fatalf("marker/events/order = %d/%v/%v", got, notifier.events, order)
			}
			want := threadevent.ThreadUpdated{ThreadID: threadExternalID, RecipientIDs: tc.wantIDs}
			if !reflect.DeepEqual(notifier.events[0], want) {
				t.Fatalf("event = %+v, want %+v", notifier.events[0], want)
			}
		})
	}
}

func TestMarkReadNotificationTimeout(t *testing.T) {
	users := &fakeUserFinder{get: func(context.Context, string) (usermodel.User, error) {
		return usermodel.User{ID: 11, ExternalID: actorExternalID}, nil
	}}
	repo := &fakeThreadRepository{markRead: func(context.Context, string, int64, int64) (threadmodel.ReadResult, error) {
		return threadmodel.ReadResult{LastReadSeq: 5, ThreadExternalID: threadExternalID}, nil
	}}
	notifier := &fakeReadNotifier{onPublish: func(ctx context.Context, _ threadevent.ThreadUpdated) {
		<-ctx.Done()
		if !errors.Is(ctx.Err(), context.DeadlineExceeded) {
			t.Fatal("notification was not bounded by timeout")
		}
	}, err: context.DeadlineExceeded}
	got, err := service.New(repo, users, &fakeGroupPublisher{}, notifier, 10*time.Millisecond).MarkRead(context.Background(), actorExternalID, threadExternalID, 5)
	if err != nil || got != 5 {
		t.Fatalf("committed marker = %d, error = %v", got, err)
	}
}
