package model

import "errors"

const (
	MaximumPlaintextBytes int64 = 20 * 1024 * 1024
	GCMTagBytes           int64 = 16
	MaximumFileBytes            = MaximumPlaintextBytes + GCMTagBytes
	MaximumRequestBytes         = MaximumFileBytes + 1024*1024
	MaximumUserBytes      int64 = 1024 * 1024 * 1024
)

var (
	ErrInvalidThreadID = errors.New("invalid thread ID")
	ErrInvalidID       = errors.New("invalid attachment ID")
	ErrEmptyFile       = errors.New("file must not be empty")
	ErrFileTooLarge    = errors.New("encrypted file exceeds 20 MiB plus authentication tag")
	ErrQuotaExceeded   = errors.New("attachment storage quota exceeded")
	ErrNotFound        = errors.New("attachment not found")
	ErrForbidden       = errors.New("attachment access forbidden")
)

type Attachment struct {
	ID         string `json:"attachmentId"`
	StorageKey string `json:"-"`
	SizeBytes  int64  `json:"sizeBytes"`
}
