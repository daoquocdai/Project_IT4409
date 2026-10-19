-- +goose Up
CREATE TABLE attachments (
    id UUID PRIMARY KEY,
    thread_id BIGINT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    uploader_id BIGINT NOT NULL REFERENCES users(id),
    message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL UNIQUE,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'attached', 'deleting')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((status = 'attached' AND message_id IS NOT NULL) OR
           (status <> 'attached' AND message_id IS NULL))
);

CREATE INDEX attachments_message_idx ON attachments(message_id);
CREATE INDEX attachments_pending_idx ON attachments(created_at) WHERE status = 'pending';

-- +goose Down
DROP TABLE attachments;
