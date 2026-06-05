-- ═══════════════════════════════════════════════════════════════
-- Migration 003: Global Feed
-- Public text posts visible to all users (text-only V1)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feed_posts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT        NOT NULL CHECK (char_length(body) > 0),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Primary query: cursor-paginated feed sorted by newest first
CREATE INDEX IF NOT EXISTS idx_feed_posts_created
    ON feed_posts (created_at DESC);

-- Secondary: fetch all posts by a specific author
CREATE INDEX IF NOT EXISTS idx_feed_posts_author
    ON feed_posts (author_id, created_at DESC);
