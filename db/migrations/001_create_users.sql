-- ═══════════════════════════════════════════════════════════════
-- Migration 001: Users table
-- Core identity store for Lynxus
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Authentication
    username        VARCHAR(32)  UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,

    -- Profile
    display_name    VARCHAR(64),
    avatar_url      TEXT         DEFAULT '',
    bio             TEXT         DEFAULT '',

    -- Matchmaking attributes
    gender          VARCHAR(16)  DEFAULT 'unspecified'
                    CHECK (gender IN ('male', 'female', 'other', 'unspecified')),
    location        VARCHAR(64)  DEFAULT '',          -- ISO 3166 alpha-2 or city
    language        VARCHAR(8)   DEFAULT 'en',        -- BCP-47 language tag
    interests       TEXT[]       DEFAULT '{}',        -- array of interest tags

    -- Monetization & moderation
    is_vip          BOOLEAN      DEFAULT FALSE,
    shadowbanned    BOOLEAN      DEFAULT FALSE,

    -- Timestamps
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
-- Fast lookups for login and profile retrieval
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- Matchmaker queries filter by these columns
CREATE INDEX IF NOT EXISTS idx_users_gender       ON users (gender);
CREATE INDEX IF NOT EXISTS idx_users_shadowbanned ON users (shadowbanned);
CREATE INDEX IF NOT EXISTS idx_users_is_vip       ON users (is_vip);

-- ── Auto-update updated_at trigger ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
