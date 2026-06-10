-- ═══════════════════════════════════════════════════════════════
-- Migration 011: Friends, Notifications, Anonymous Users
-- Adds Discord-style friend system, real-time notification
-- storage, and ephemeral anonymous account support.
-- ═══════════════════════════════════════════════════════════════

-- ── Anonymous / Guest User Support ───────────────────────────
-- is_anonymous: true for ephemeral guest accounts
-- expires_at:   set to NOW()+24h for anonymous users; NULL for
--               registered users (never expires)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at   TIMESTAMPTZ DEFAULT NULL;

-- Index to efficiently find expired anonymous accounts for cleanup
CREATE INDEX IF NOT EXISTS idx_users_anon_expiry
    ON users (is_anonymous, expires_at)
    WHERE is_anonymous = TRUE;

-- ── Friendships Table ────────────────────────────────────────
-- Models the state machine for user relationships:
--   pending  → a request has been sent (requester → addressee)
--   accepted → both users are friends (bidirectional)
--   blocked  → requester has blocked addressee
--
-- Security design:
--   • UNIQUE(requester_id, addressee_id) prevents duplicate requests
--   • CHECK(requester_id != addressee_id) prevents self-friend
--   • Foreign key cascades handle user deletion cleanly
--   • To check if A and B are friends: query both orderings
CREATE TABLE IF NOT EXISTS friendships (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(16) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (requester_id, addressee_id),
    CHECK (requester_id != addressee_id)
);

-- Index for fast "incoming requests" lookup (addressee's pending view)
CREATE INDEX IF NOT EXISTS idx_friendships_addressee
    ON friendships (addressee_id, status);

-- Index for fast "outgoing requests" lookup (requester's pending view)
CREATE INDEX IF NOT EXISTS idx_friendships_requester
    ON friendships (requester_id, status);

-- Auto-update updated_at on status change
CREATE TRIGGER trg_friendships_updated_at
    BEFORE UPDATE ON friendships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── Notifications Table ───────────────────────────────────────
-- Stores in-app notifications for real-time delivery via WS
-- and persistent history via REST API.
--
-- Notification types:
--   friend_request   → actor sent a friend request to user
--   friend_accepted  → actor accepted user's friend request
--   profile_approved → moderator approved user's profile update
--   mod_action       → a moderation action was taken on user
--
-- data JSONB allows type-specific payloads without schema changes.
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       VARCHAR(32) NOT NULL
               CHECK (type IN ('friend_request', 'friend_accepted', 'profile_approved', 'mod_action')),
    actor_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
    data       JSONB       NOT NULL DEFAULT '{}',
    is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for fetching a user's unread notifications efficiently
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, is_read, created_at DESC);

-- ── Profile Reviews Table (Moderator Queue) ───────────────────
-- When a user updates their profile, a review entry is created.
-- Moderators approve or reject from the /mod dashboard.
-- On approval, a 'profile_approved' notification is sent to user.
--
-- status: pending → approved | rejected
CREATE TABLE IF NOT EXISTS profile_reviews (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewer_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    old_data     JSONB       NOT NULL DEFAULT '{}',
    new_data     JSONB       NOT NULL DEFAULT '{}',
    status       VARCHAR(16) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT    DEFAULT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at  TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_reviews_pending
    ON profile_reviews (status, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_profile_reviews_user
    ON profile_reviews (user_id, created_at DESC);
