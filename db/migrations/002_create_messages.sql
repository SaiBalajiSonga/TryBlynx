-- ═══════════════════════════════════════════════════════════════
-- Migration 002: Conversations & Messages
-- Unified messaging store for DMs, group chats, and random chats
-- ═══════════════════════════════════════════════════════════════

-- ── Conversations ────────────────────────────────────────────
-- A conversation is a container for messages between 2+ users.
-- Type distinguishes DM, group, and random (matchmaker) chats.
CREATE TABLE IF NOT EXISTS conversations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(16) NOT NULL
                CHECK (type IN ('dm', 'group', 'random')),
    name        VARCHAR(128) DEFAULT '',   -- display name for group chats
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations (type);

-- ── Conversation Members ─────────────────────────────────────
-- Junction table: which users belong to which conversations.
CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

-- Quickly find all conversations for a given user
CREATE INDEX IF NOT EXISTS idx_conv_members_user
    ON conversation_members (user_id, conversation_id);

-- ── Messages ─────────────────────────────────────────────────
-- All chat messages (DM, group, random) are stored here.
-- Text-only for V1.
CREATE TABLE IF NOT EXISTS messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
    body            TEXT        NOT NULL CHECK (char_length(body) > 0),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Primary query pattern: fetch messages in a conversation, newest first
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
    ON messages (conversation_id, created_at DESC);

-- Secondary: find all messages by a specific sender
CREATE INDEX IF NOT EXISTS idx_messages_sender
    ON messages (sender_id, created_at DESC);
