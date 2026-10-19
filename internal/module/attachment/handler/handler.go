package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	authmiddleware "github.com/daoquocdai/chat-api/internal/middleware"
	attachmentmodel "github.com/daoquocdai/chat-api/internal/module/attachment/model"
	attachmentrepository "github.com/daoquocdai/chat-api/internal/module/attachment/repository"
	threadmodel "github.com/daoquocdai/chat-api/internal/module/thread/model"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	repository *attachmentrepository.Postgres
	directory  string
}

func New(repository *attachmentrepository.Postgres, directory string) (*Handler, error) {
	directory = filepath.Clean(directory)
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, fmt.Errorf("create attachment directory: %w", err)
	}
	return &Handler{repository: repository, directory: directory}, nil
}

func (h *Handler) StartCleanup(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			h.cleanup(ctx)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (h *Handler) cleanup(ctx context.Context) {
	items, err := h.repository.ClaimExpired(ctx)
	if err != nil {
		log.Printf("claim expired attachments: %v", err)
		return
	}
	for _, item := range items {
		err := os.Remove(filepath.Join(h.directory, item.StorageKey))
		removed := err == nil || errors.Is(err, os.ErrNotExist)
		if err := h.repository.FinishDelete(ctx, item.ID, removed); err != nil {
			log.Printf("finish attachment cleanup %s: %v", item.ID, err)
		}
	}
}

func (h *Handler) Upload(c *gin.Context) {
	actorID, ok := authmiddleware.AuthenticatedUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := uuid.Parse(c.Param("id")); err != nil {
		h.writeError(c, attachmentmodel.ErrInvalidThreadID)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, attachmentmodel.MaximumRequestBytes)
	fileHeader, err := c.FormFile("file")
	if err != nil {
		h.writeUploadError(c, err)
		return
	}
	if fileHeader.Size <= 0 {
		h.writeError(c, attachmentmodel.ErrEmptyFile)
		return
	}
	if fileHeader.Size > attachmentmodel.MaximumFileBytes {
		h.writeError(c, attachmentmodel.ErrFileTooLarge)
		return
	}
	source, err := fileHeader.Open()
	if err != nil {
		h.writeUploadError(c, err)
		return
	}
	defer source.Close()

	id := uuid.NewString()
	storageKey := id + ".bin"
	temporary, err := os.CreateTemp(h.directory, ".upload-*")
	if err != nil {
		h.writeInternal(c, err)
		return
	}
	temporaryName := temporary.Name()
	keep := false
	defer func() {
		temporary.Close()
		if !keep {
			_ = os.Remove(temporaryName)
		}
	}()
	written, copyErr := io.Copy(temporary, io.LimitReader(source, attachmentmodel.MaximumFileBytes+1))
	if copyErr != nil {
		h.writeInternal(c, copyErr)
		return
	}
	if written <= 0 {
		h.writeError(c, attachmentmodel.ErrEmptyFile)
		return
	}
	if written > attachmentmodel.MaximumFileBytes {
		h.writeError(c, attachmentmodel.ErrFileTooLarge)
		return
	}
	if err := temporary.Sync(); err != nil {
		h.writeInternal(c, err)
		return
	}
	if err := temporary.Close(); err != nil {
		h.writeInternal(c, err)
		return
	}
	finalPath := filepath.Join(h.directory, storageKey)
	if err := os.Rename(temporaryName, finalPath); err != nil {
		h.writeInternal(c, err)
		return
	}
	keep = true
	if err := h.repository.CreatePending(c.Request.Context(), actorID, c.Param("id"), id, storageKey, written); err != nil {
		if removeErr := os.Remove(finalPath); removeErr != nil {
			log.Printf("remove orphan attachment %s: %v", id, removeErr)
		}
		h.writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, attachmentmodel.Attachment{ID: id, SizeBytes: written})
}

func (h *Handler) Content(c *gin.Context) {
	actorID, ok := authmiddleware.AuthenticatedUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := uuid.Parse(c.Param("id")); err != nil {
		h.writeError(c, attachmentmodel.ErrInvalidID)
		return
	}
	attachment, err := h.repository.Content(c.Request.Context(), actorID, c.Param("id"))
	if err != nil {
		h.writeError(c, err)
		return
	}
	path := filepath.Join(h.directory, attachment.StorageKey)
	if filepath.Dir(path) != h.directory {
		h.writeError(c, attachmentmodel.ErrNotFound)
		return
	}
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		h.writeError(c, attachmentmodel.ErrNotFound)
		return
	}
	if err != nil {
		h.writeInternal(c, err)
		return
	}
	defer file.Close()
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Disposition", "attachment; filename=attachment.bin")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "private, no-store")
	c.Header("Content-Length", fmt.Sprint(attachment.SizeBytes))
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, file)
}

func (h *Handler) writeUploadError(c *gin.Context, err error) {
	var maxErr *http.MaxBytesError
	if errors.As(err, &maxErr) || strings.Contains(strings.ToLower(err.Error()), "request body too large") {
		h.writeError(c, attachmentmodel.ErrFileTooLarge)
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": "invalid multipart upload"})
}
func (h *Handler) writeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, attachmentmodel.ErrInvalidThreadID), errors.Is(err, attachmentmodel.ErrInvalidID), errors.Is(err, attachmentmodel.ErrEmptyFile):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, attachmentmodel.ErrFileTooLarge):
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": err.Error()})
	case errors.Is(err, attachmentmodel.ErrQuotaExceeded):
		c.JSON(http.StatusInsufficientStorage, gin.H{"error": err.Error()})
	case errors.Is(err, attachmentmodel.ErrNotFound), errors.Is(err, threadmodel.ErrThreadNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, attachmentmodel.ErrForbidden), errors.Is(err, threadmodel.ErrNotParticipant):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	default:
		h.writeInternal(c, err)
	}
}
func (h *Handler) writeInternal(c *gin.Context, err error) {
	log.Printf("attachment handler: %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
}
