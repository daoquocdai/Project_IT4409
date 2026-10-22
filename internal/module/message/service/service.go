package service

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/daoquocdai/chat-api/internal/e2ee"
	messageevent "github.com/daoquocdai/chat-api/internal/module/message/event"
	"github.com/daoquocdai/chat-api/internal/module/message/model"
	usermodel "github.com/daoquocdai/chat-api/internal/module/user/model"
	"github.com/google/uuid"
)

const maximumContentCharacters = 1000

type Repository interface {
	MembershipVersionAtSequence(context.Context, string, int64) (int64, error)
	ListMemberIDsAtSequence(context.Context, string, int64) ([]string, error)
	Send(
		ctx context.Context,
		threadExternalID string,
		senderID int64,
		messageID, contentFormat, content string,
	) (model.Message, bool, error)
	List(
		ctx context.Context,
		threadExternalID string,
		userID int64,
		beforeSeq *int64,
		limit int,
	) (model.Page, error)
}

type recallRepository interface {
	Recall(context.Context, int64, string) (model.Recall, bool, error)
	ListChanges(context.Context, int64, int64, int) (model.ChangePage, error)
}

type UserFinder interface {
	GetByExternalID(ctx context.Context, externalID string) (usermodel.User, error)
}

func (s *Service) Recall(ctx context.Context, actorExternalID, messageID string) (model.Recall, bool, error) {
	actor, err := s.users.GetByExternalID(ctx, actorExternalID)
	if err != nil {
		return model.Recall{}, false, err
	}
	repository, ok := s.repository.(recallRepository)
	if !ok {
		return model.Recall{}, false, errors.New("recall repository is unavailable")
	}
	return repository.Recall(ctx, actor.ID, strings.TrimSpace(messageID))
}

func (s *Service) ListChanges(ctx context.Context, actorExternalID string, after int64, limit int) (model.ChangePage, error) {
	if after < 0 || limit < 1 || limit > 100 {
		return model.ChangePage{}, model.ErrInvalidLimit
	}
	actor, err := s.users.GetByExternalID(ctx, actorExternalID)
	if err != nil {
		return model.ChangePage{}, err
	}
	repository, ok := s.repository.(recallRepository)
	if !ok {
		return model.ChangePage{}, errors.New("recall repository is unavailable")
	}
	return repository.ListChanges(ctx, actor.ID, after, limit)
}

type Publisher interface {
	Publish(ctx context.Context, event messageevent.MessageCreated) error
}

type Service struct {
	repository     Repository
	users          UserFinder
	publisher      Publisher
	cache          MembershipCache
	publishTimeout time.Duration
}

func New(
	repository Repository,
	users UserFinder,
	publisher Publisher,
	cache MembershipCache,
	publishTimeout time.Duration,
) *Service {
	return &Service{
		repository:     repository,
		users:          users,
		publisher:      publisher,
		cache:          cache,
		publishTimeout: publishTimeout,
	}
}

func (s *Service) Send(
	ctx context.Context,
	actorExternalID, threadExternalID, messageID, contentFormat, content string,
) (model.Message, bool, error) {
	return s.SendWithAttachments(ctx, actorExternalID, threadExternalID, messageID, contentFormat, content, nil)
}

type attachmentRepository interface {
	SendWithAttachments(context.Context, string, int64, string, string, string, []string) (model.Message, bool, error)
}

func (s *Service) SendWithAttachments(
	ctx context.Context,
	actorExternalID, threadExternalID, messageID, contentFormat, content string,
	attachmentIDs []string,
) (model.Message, bool, error) {
	threadExternalID = strings.TrimSpace(threadExternalID)
	if threadExternalID == "" {
		return model.Message{}, false, model.ErrThreadIDRequired
	}
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return model.Message{}, false, model.ErrMessageIDRequired
	}
	if contentFormat == "" {
		contentFormat = "plaintext"
	}
	switch contentFormat {
	case "plaintext":
		content = strings.TrimSpace(content)
		if length := utf8.RuneCountInString(content); !utf8.ValidString(content) ||
			length == 0 || length > maximumContentCharacters || strings.ContainsRune(content, '\x00') {
			return model.Message{}, false, model.ErrInvalidContent
		}
	case "e2ee_v2":
		if _, err := e2ee.ParseMessageEnvelope(content); err != nil {
			return model.Message{}, false, model.ErrInvalidEnvelope
		}
	default:
		return model.Message{}, false, model.ErrInvalidContentFormat
	}

	actor, err := s.users.GetByExternalID(ctx, actorExternalID)
	if err != nil {
		return model.Message{}, false, err
	}

	if len(attachmentIDs) > 5 {
		return model.Message{}, false, model.ErrInvalidAttachments
	}
	seen := make(map[string]struct{}, len(attachmentIDs))
	for _, id := range attachmentIDs {
		id = strings.TrimSpace(id)
		if _, parseErr := uuid.Parse(id); id == "" || parseErr != nil {
			return model.Message{}, false, model.ErrInvalidAttachments
		}
		if _, duplicate := seen[id]; duplicate {
			return model.Message{}, false, model.ErrInvalidAttachments
		}
		seen[id] = struct{}{}
	}
	var message model.Message
	var created bool
	if len(attachmentIDs) == 0 {
		message, created, err = s.repository.Send(ctx, threadExternalID, actor.ID, messageID, contentFormat, content)
	} else if repository, ok := s.repository.(attachmentRepository); ok {
		message, created, err = repository.SendWithAttachments(ctx, threadExternalID, actor.ID, messageID, contentFormat, content, attachmentIDs)
	} else {
		err = errors.New("attachment repository is unavailable")
	}
	if err != nil {
		return model.Message{}, false, err
	}

	if err := s.PublishMessage(ctx, message); err != nil {
		return message, created, err
	}

	return message, created, nil
}

func (s *Service) List(
	ctx context.Context,
	actorExternalID, threadExternalID string,
	beforeSeq *int64,
	limit int,
) (model.Page, error) {
	threadExternalID = strings.TrimSpace(threadExternalID)
	if threadExternalID == "" {
		return model.Page{}, model.ErrThreadIDRequired
	}
	if beforeSeq != nil && *beforeSeq <= 0 {
		return model.Page{}, model.ErrInvalidBeforeSeq
	}
	if limit < 1 || limit > model.MaximumPageLimit {
		return model.Page{}, model.ErrInvalidLimit
	}

	actor, err := s.users.GetByExternalID(ctx, actorExternalID)
	if err != nil {
		return model.Page{}, err
	}

	page, err := s.repository.List(
		ctx,
		threadExternalID,
		actor.ID,
		beforeSeq,
		limit,
	)
	if err != nil {
		return model.Page{}, err
	}

	if page.Messages == nil {
		page.Messages = []model.Message{}
	}

	return page, nil
}
