-- ═══════════════════════════════════════════════════════════════
-- Migration 016: Message Replies
-- Adds reply_to_id to messages to support threads/replies
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE messages
ADD COLUMN reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;
