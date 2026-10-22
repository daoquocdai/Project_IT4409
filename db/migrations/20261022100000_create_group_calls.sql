-- +goose Up
CREATE TABLE group_calls (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    external_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    thread_id BIGINT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    created_by BIGINT NOT NULL REFERENCES users(id),
    media_type TEXT NOT NULL CHECK (media_type IN ('audio','video')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','ended')),
    version BIGINT NOT NULL DEFAULT 1,
    empty_since TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX group_calls_one_open_per_thread ON group_calls(thread_id) WHERE status='open';

CREATE TABLE group_call_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    external_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    call_id BIGINT NOT NULL REFERENCES group_calls(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    device_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'joining' CHECK (status IN ('joining','ready','left')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX group_call_one_session_per_user ON group_call_sessions(call_id,user_id) WHERE status IN ('joining','ready');
CREATE INDEX group_call_sessions_call_idx ON group_call_sessions(call_id);
CREATE INDEX group_call_sessions_stale_idx ON group_call_sessions(last_seen_at) WHERE status IN ('joining','ready');

ALTER TABLE active_call_users ALTER COLUMN call_id DROP NOT NULL;
ALTER TABLE active_call_users ADD COLUMN group_call_id BIGINT REFERENCES group_calls(id) ON DELETE CASCADE;
ALTER TABLE active_call_users ADD CONSTRAINT active_call_users_exactly_one_call CHECK ((call_id IS NOT NULL) <> (group_call_id IS NOT NULL));

CREATE TABLE group_call_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id BIGINT NOT NULL REFERENCES group_calls(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('group-call.started','group-call.participant-ready','group-call.participant-left','group-call.ended')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX group_call_events_pending_idx ON group_call_events(created_at) WHERE published_at IS NULL;

-- +goose Down
DROP TABLE group_call_events;
ALTER TABLE active_call_users DROP CONSTRAINT active_call_users_exactly_one_call;
ALTER TABLE active_call_users DROP COLUMN group_call_id;
ALTER TABLE active_call_users ALTER COLUMN call_id SET NOT NULL;
DROP TABLE group_call_sessions;
DROP TABLE group_calls;
