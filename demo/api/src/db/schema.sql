-- OpenCALL Demo Library - API Database Schema

-- Catalog items sourced from Open Library + faker (REQ-SEED)
CREATE TABLE IF NOT EXISTS catalog_items (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,           -- 'book', 'cd', 'dvd', 'boardgame'
    title           TEXT NOT NULL,
    creator         TEXT NOT NULL,           -- author, artist, publisher
    year            INTEGER,
    isbn            TEXT,
    description     TEXT,
    cover_image_key TEXT,                    -- GCS object key, nullable
    tags            TEXT DEFAULT '[]',       -- JSON array of strings
    available       INTEGER NOT NULL DEFAULT 1,  -- boolean: 1 if availableCopies > 0
    total_copies    INTEGER NOT NULL DEFAULT 1,
    available_copies INTEGER NOT NULL DEFAULT 1
);

-- Patron records (REQ-SEED, REQ-AUTH)
CREATE TABLE IF NOT EXISTS patrons (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    card_number     TEXT NOT NULL UNIQUE,    -- format: XXXX-XXXX-XX
    created_at      TEXT NOT NULL,           -- ISO 8601
    is_seed         INTEGER NOT NULL DEFAULT 0  -- 1 for seed patrons, preserved on reset
);

-- Lending history records (REQ-SEED, REQ-OPS-SYNC)
CREATE TABLE IF NOT EXISTS lending_history (
    id                      TEXT PRIMARY KEY,
    item_id                 TEXT NOT NULL REFERENCES catalog_items(id),
    patron_id               TEXT NOT NULL REFERENCES patrons(id),
    patron_name             TEXT NOT NULL,
    checkout_date           TEXT NOT NULL,       -- ISO 8601
    due_date                TEXT NOT NULL,        -- ISO 8601 (checkout + 14 days)
    return_date             TEXT,                 -- ISO 8601, null if still checked out
    days_late               INTEGER DEFAULT 0,
    reserved_date           TEXT,                 -- ISO 8601, null if not from reservation
    collection_delay_days   INTEGER DEFAULT 0,
    is_seed                 INTEGER NOT NULL DEFAULT 0  -- 1 for seed records, preserved on reset
);

-- Active reservations (REQ-OPS-SYNC: item.reserve)
CREATE TABLE IF NOT EXISTS reservations (
    id              TEXT PRIMARY KEY,
    item_id         TEXT NOT NULL REFERENCES catalog_items(id),
    patron_id       TEXT NOT NULL REFERENCES patrons(id),
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'ready', 'collected', 'cancelled'
    reserved_at     TEXT NOT NULL,           -- ISO 8601
    ready_at        TEXT,                    -- ISO 8601
    collected_at    TEXT,                    -- ISO 8601
    cancelled_at    TEXT                     -- ISO 8601
);

-- Async operation state persistence (REQ-OPS-ASYNC)
CREATE TABLE IF NOT EXISTS operations (
    request_id      TEXT PRIMARY KEY,
    session_id      TEXT,
    op              TEXT NOT NULL,
    args            TEXT DEFAULT '{}',       -- JSON
    patron_id       TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'accepted',  -- 'accepted', 'pending', 'complete', 'error'
    result_location TEXT,                    -- GCS signed URL or null
    result_data     TEXT,                    -- stored report data for chunked retrieval
    error           TEXT,                    -- JSON error object or null
    created_at      TEXT NOT NULL,           -- ISO 8601
    updated_at      TEXT NOT NULL,           -- ISO 8601
    expires_at      INTEGER NOT NULL,        -- Unix epoch seconds
    last_polled_at  INTEGER                  -- Unix epoch ms, for rate limiting
);

-- Authentication tokens (REQ-AUTH)
CREATE TABLE IF NOT EXISTS auth_tokens (
    token           TEXT PRIMARY KEY,
    token_type      TEXT NOT NULL,           -- 'demo' or 'agent'
    username        TEXT NOT NULL,
    patron_id       TEXT NOT NULL,
    scopes          TEXT NOT NULL DEFAULT '[]',  -- JSON array of scope strings
    analytics_id    TEXT,                    -- FK to analytics_visitors.id or analytics_agents.id
    expires_at      INTEGER NOT NULL,        -- Unix epoch seconds
    created_at      TEXT NOT NULL            -- ISO 8601
);

-- Visitor analytics (REQ-ANALYTICS) — NOT reset
CREATE TABLE IF NOT EXISTS analytics_visitors (
    id              TEXT PRIMARY KEY,
    patron_id       TEXT,
    card_number     TEXT,
    username        TEXT,
    user_agent      TEXT NOT NULL,
    ip              TEXT NOT NULL,
    referrer        TEXT,
    page_views      INTEGER NOT NULL DEFAULT 0,
    api_calls       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,           -- ISO 8601
    updated_at      TEXT NOT NULL            -- ISO 8601
);

-- Agent analytics (REQ-ANALYTICS) — NOT reset
CREATE TABLE IF NOT EXISTS analytics_agents (
    id              TEXT PRIMARY KEY,
    visitor_id      TEXT NOT NULL REFERENCES analytics_visitors(id),
    patron_id       TEXT NOT NULL,
    card_number     TEXT NOT NULL,
    user_agent      TEXT NOT NULL,
    ip              TEXT NOT NULL,
    api_calls       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,           -- ISO 8601
    updated_at      TEXT NOT NULL            -- ISO 8601
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lending_patron     ON lending_history(patron_id);
CREATE INDEX IF NOT EXISTS idx_lending_item       ON lending_history(item_id);
CREATE INDEX IF NOT EXISTS idx_lending_overdue    ON lending_history(patron_id, return_date) WHERE return_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_patron ON reservations(patron_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_item  ON reservations(item_id, status);
CREATE INDEX IF NOT EXISTS idx_tokens_patron      ON auth_tokens(patron_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expiry      ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_catalog_type       ON catalog_items(type);
CREATE INDEX IF NOT EXISTS idx_catalog_available  ON catalog_items(available);
CREATE INDEX IF NOT EXISTS idx_visitors_ip_ua     ON analytics_visitors(ip, user_agent);
CREATE INDEX IF NOT EXISTS idx_agents_visitor     ON analytics_agents(visitor_id);
CREATE INDEX IF NOT EXISTS idx_agents_card        ON analytics_agents(card_number);
