-- ═══════════════════════════════════════════════════════════════
-- Migration 008: User Reporting and Blocking
-- Adds tables to handle user-to-user blocking and reporting
-- ═══════════════════════════════════════════════════════════════

-- ── 1. User Blocks ─────────────────────────────────────────────
-- Tracks which user blocked whom. This is a one-way relationship.
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- A user cannot block the same person twice
    PRIMARY KEY (blocker_id, blocked_id),
    
    -- A user cannot block themselves
    CONSTRAINT chk_no_self_block CHECK (blocker_id != blocked_id)
);

-- Fast lookup for checking if a specific user is blocked by another
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);


-- ── 2. User Reports ────────────────────────────────────────────
-- Tracks reports filed against users or specific messages
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Optional: If the report is about a specific message
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- The reason for the report
    reason TEXT NOT NULL,
    
    -- Status of the report: 'pending', 'reviewed', 'resolved', 'dismissed'
    status VARCHAR(32) DEFAULT 'pending',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- A user shouldn't report themselves
    CONSTRAINT chk_no_self_report CHECK (reporter_id != reported_id)
);

-- Fast lookups for admins viewing reports
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_id);

-- Trigger to auto-update updated_at for reports
CREATE TRIGGER trg_user_reports_updated_at
    BEFORE UPDATE ON user_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
