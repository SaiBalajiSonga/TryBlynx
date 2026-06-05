-- ═══════════════════════════════════════════════════════════════
-- Migration 004: DM Convenience View & Unique Pair Constraint
-- Ensures only one DM conversation exists between any two users
-- ═══════════════════════════════════════════════════════════════

-- ── Unique DM pairs ──────────────────────────────────────────
-- This table enforces that two users can only have one DM conversation.
-- user_a_id is always the lexicographically smaller UUID.
CREATE TABLE IF NOT EXISTS dm_pairs (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_a_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (conversation_id),
    -- Ensure one DM per pair (ordered by UUID to avoid duplicates)
    CONSTRAINT uq_dm_pair UNIQUE (user_a_id, user_b_id),
    -- Ensure user_a < user_b to prevent (A,B) and (B,A) both existing
    CONSTRAINT ck_dm_pair_order CHECK (user_a_id < user_b_id)
);

-- Fast lookup: "find my DM with user X"
CREATE INDEX IF NOT EXISTS idx_dm_pairs_user_a ON dm_pairs (user_a_id);
CREATE INDEX IF NOT EXISTS idx_dm_pairs_user_b ON dm_pairs (user_b_id);

-- ── Helper function: get or create a DM conversation ─────────
-- Returns the conversation_id for a DM between two users,
-- creating one if it doesn't exist.
CREATE OR REPLACE FUNCTION get_or_create_dm(
    p_user_1 UUID,
    p_user_2 UUID
) RETURNS UUID AS $$
DECLARE
    v_user_a UUID;
    v_user_b UUID;
    v_conv_id UUID;
BEGIN
    -- Normalize ordering: smaller UUID is always user_a
    IF p_user_1 < p_user_2 THEN
        v_user_a := p_user_1;
        v_user_b := p_user_2;
    ELSE
        v_user_a := p_user_2;
        v_user_b := p_user_1;
    END IF;

    -- Try to find an existing DM
    SELECT conversation_id INTO v_conv_id
    FROM dm_pairs
    WHERE user_a_id = v_user_a AND user_b_id = v_user_b;

    IF v_conv_id IS NOT NULL THEN
        RETURN v_conv_id;
    END IF;

    -- Create a new conversation
    INSERT INTO conversations (type, name)
    VALUES ('dm', '')
    RETURNING id INTO v_conv_id;

    -- Register both members
    INSERT INTO conversation_members (conversation_id, user_id)
    VALUES (v_conv_id, v_user_a), (v_conv_id, v_user_b);

    -- Register the DM pair for uniqueness
    INSERT INTO dm_pairs (conversation_id, user_a_id, user_b_id)
    VALUES (v_conv_id, v_user_a, v_user_b);

    RETURN v_conv_id;
END;
$$ LANGUAGE plpgsql;
