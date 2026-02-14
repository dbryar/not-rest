-- OpenCALL Demo Library - App Session Database Schema

-- Server-side sessions (REQ-APP)
CREATE TABLE IF NOT EXISTS sessions (
    sid                     TEXT PRIMARY KEY,
    token                   TEXT NOT NULL,           -- API bearer token
    username                TEXT NOT NULL,
    card_number             TEXT NOT NULL,
    analytics_visitor_id    TEXT,                     -- FK to api analytics_visitors.id
    scopes                  TEXT NOT NULL DEFAULT '[]',  -- JSON array of scope strings
    expires_at              INTEGER NOT NULL,         -- Unix epoch seconds
    created_at              TEXT NOT NULL             -- ISO 8601
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
