-- +goose Up
CREATE TABLE calls (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    external_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    thread_id BIGINT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    caller_id BIGINT NOT NULL REFERENCES users(id),
    callee_id BIGINT NOT NULL REFERENCES users(id),
    client_request_id UUID NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('audio','video')),
    status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','connecting','active','ended')),
    end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('completed','cancelled','rejected','missed','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ring_expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    UNIQUE(caller_id, client_request_id),
    CHECK (caller_id <> callee_id)
);
CREATE INDEX calls_thread_created_idx ON calls(thread_id,created_at DESC);
CREATE INDEX calls_pending_timeout_idx ON calls(ring_expires_at) WHERE status='ringing';

CREATE TABLE active_call_users (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    call_id BIGINT NOT NULL REFERENCES calls(id) ON DELETE CASCADE
);

CREATE TABLE call_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id BIGINT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('call.invited','call.accepted','call.ended')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX call_events_pending_idx ON call_events(created_at) WHERE published_at IS NULL;

-- +goose Down
DROP TABLE call_events;
DROP TABLE active_call_users;
DROP TABLE calls;
