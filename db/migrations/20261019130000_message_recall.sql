-- +goose Up
ALTER TABLE messages
    ALTER COLUMN content DROP NOT NULL,
    ADD COLUMN recalled_at TIMESTAMPTZ;

CREATE TABLE message_change_events (
    id UUID PRIMARY KEY,
    change_seq BIGSERIAL NOT NULL UNIQUE,
    event_type TEXT NOT NULL CHECK (event_type IN ('message.recalled')),
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    thread_id BIGINT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    recalled_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_type, message_id)
);
CREATE INDEX message_change_events_pending_idx
    ON message_change_events(change_seq) WHERE published_at IS NULL;

-- +goose Down
DROP TABLE message_change_events;
ALTER TABLE messages DROP COLUMN recalled_at;
UPDATE messages SET content='' WHERE content IS NULL;
ALTER TABLE messages ALTER COLUMN content SET NOT NULL;
