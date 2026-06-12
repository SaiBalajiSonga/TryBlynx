-- Migration 012: Add key_backup_blob column to users
-- Stores the user's E2EE private key encrypted with their passphrase.
-- The server cannot decrypt this — it is opaque ciphertext.
ALTER TABLE users ADD COLUMN IF NOT EXISTS key_backup_blob TEXT;
