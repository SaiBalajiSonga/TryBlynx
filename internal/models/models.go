// ═══════════════════════════════════════════════════════════════
// File:         internal/models/models.go
// Purpose:      Domain model definitions for the TryBlynx platform
// Dependencies: github.com/google/uuid, time
// Role:         Central type definitions shared across all packages.
//               These structs map directly to PostgreSQL tables and
//               are used for JSON serialization in API responses.
//               Security-sensitive fields use the json:"-" tag to
//               prevent accidental exposure.
// ═══════════════════════════════════════════════════════════════

package models

import (
	"time"

	"github.com/google/uuid"
)

// ──────────────────────────────────────────────────────────────
// User
// ──────────────────────────────────────────────────────────────

// User represents a registered platform user. Maps to the
// "users" table defined in 001_create_users.sql.
//
// Security considerations:
//   - PasswordHash is tagged json:"-" and never sent to clients.
//   - Shadowbanned is tagged json:"-" to maintain transparency
//     (shadowbanned users must not know their status).
type User struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	DisplayName  string    `json:"display_name"`
	AvatarURL    string    `json:"avatar_url"`
	Bio          string    `json:"bio"`
	Gender       string    `json:"gender"`
	Location     string    `json:"location"`
	Language     string    `json:"language"`
	Interests    []string  `json:"interests"`
	IsVIP        bool      `json:"is_vip"`
	IsAdmin      bool      `json:"is_admin"`
	IsModerator  bool      `json:"is_moderator"`
	IsDeveloper  bool      `json:"is_developer"`
	Shadowbanned bool      `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ──────────────────────────────────────────────────────────────
// Conversations & Messages
// ──────────────────────────────────────────────────────────────

// Conversation represents a chat container. The Type field
// distinguishes between "dm", "group", and "random" (matchmaker)
// conversations. Maps to 002_create_messages.sql.
type Conversation struct {
	ID        uuid.UUID `json:"id"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

// ConversationSummary extends Conversation with the most recent
// message preview, used when listing a user's conversations.
type ConversationSummary struct {
	Conversation
	LastMessage   string     `json:"last_message,omitempty"`
	LastMessageAt *time.Time `json:"last_message_at,omitempty"`
}

// Message represents a single text message within a conversation.
// SenderID is a pointer to handle system messages or deleted users
// (ON DELETE SET NULL in the schema).
type Message struct {
	ID             uuid.UUID  `json:"id"`
	ConversationID uuid.UUID  `json:"conversation_id"`
	SenderID       *uuid.UUID `json:"sender_id,omitempty"`
	Body           string     `json:"body"`
	CreatedAt      time.Time  `json:"created_at"`
}

// ──────────────────────────────────────────────────────────────
// Global Feed
// ──────────────────────────────────────────────────────────────

// FeedPost represents a public text post on the global feed.
// The optional Author field is populated via JOIN when fetching
// feed listings. Maps to 003_create_feed.sql.
type FeedPost struct {
	ID        uuid.UUID `json:"id"`
	AuthorID  uuid.UUID `json:"author_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
	Author    *User     `json:"author,omitempty"`
}
