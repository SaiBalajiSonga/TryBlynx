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
	ID                  uuid.UUID  `json:"id"`
	Username            string     `json:"username"`
	Email               string     `json:"email"`
	PasswordHash        string     `json:"-"`
	DisplayName         string     `json:"display_name"`
	AvatarURL           string     `json:"avatar_url"`
	Bio                 string     `json:"bio"`
	Gender              string     `json:"gender"`
	Location            string     `json:"location"`
	Language            string     `json:"language"`
	Interests           []string   `json:"interests"`
	IsVIP               bool       `json:"is_vip"`
	IsAdmin             bool       `json:"is_admin"`
	IsModerator         bool       `json:"is_moderator"`
	IsDeveloper         bool       `json:"is_developer"`
	PublicKey           string     `json:"public_key"`
	EncryptedPrivateKey string     `json:"-"` // E2EE Backup — never serialized to JSON; returned explicitly in authResponse
	Shadowbanned        bool       `json:"-"`
	DeviceFingerprint   string     `json:"-"`
	StrikeCount         int        `json:"-"` // internal moderation field; not shared cross-user
	BannedUntil         *time.Time `json:"-"` // internal moderation field; not shared cross-user
	IsAnonymous         bool       `json:"is_anonymous"`
	ExpiresAt           *time.Time `json:"expires_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// PublicUser is a safe view of a User, exposing only public-safe fields.
// Used in search results and profile views — anonymous users see this
// shape of other users (no email, device info, or internal flags).
// Role fields (IsAdmin, IsModerator, IsDeveloper) are included because
// they are social trust signals (role badges), not security-sensitive data.
type PublicUser struct {
	ID          uuid.UUID `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url"`
	Bio         string    `json:"bio"`
	Gender      string    `json:"gender"`
	Location    string    `json:"location"`
	Language    string    `json:"language"`
	Interests   []string  `json:"interests"`
	IsVIP       bool      `json:"is_vip"`
	IsAdmin     bool      `json:"is_admin"`
	IsModerator bool      `json:"is_moderator"`
	IsDeveloper bool      `json:"is_developer"`
	IsAnonymous bool      `json:"is_anonymous"`
	CreatedAt   time.Time `json:"created_at"`
}

// ──────────────────────────────────────────────────────────────
// Conversations & Messages
// ──────────────────────────────────────────────────────────────

// Conversation represents a chat container. The Type field
// distinguishes between "dm", "group", and "random" (matchmaker)
// conversations. Maps to 002_create_messages.sql.
type Conversation struct {
	ID              uuid.UUID `json:"id"`
	Type            string    `json:"type"`
	Name            string    `json:"name,omitempty"`
	Description     string    `json:"description,omitempty"`
	IsNSFW          bool      `json:"is_nsfw"`
	SlowmodeSeconds int       `json:"slowmode_seconds"`
	CreatedAt       time.Time `json:"created_at"`
	MemberCount     int       `json:"member_count,omitempty"`
}

// ConversationSummary extends Conversation with the most recent
// message preview, used when listing a user's conversations.
type ConversationSummary struct {
	Conversation
	LastMessage         string     `json:"last_message,omitempty"`
	LastMessageAt       *time.Time `json:"last_message_at,omitempty"`
	LastMessageSenderID *uuid.UUID `json:"last_message_sender_id,omitempty"`
	IsOnline            bool       `json:"is_online,omitempty"`
	LastActiveAt        *time.Time `json:"last_active_at,omitempty"`
}

// Message represents a single text message within a conversation.
// SenderID is a pointer to handle system messages or deleted users
// (ON DELETE SET NULL in the schema).
type Message struct {
	ID             uuid.UUID         `json:"id"`
	ConversationID uuid.UUID         `json:"conversation_id"`
	SenderID       *uuid.UUID        `json:"sender_id,omitempty"`
	SenderName     string            `json:"sender_name,omitempty"`
	Body           string            `json:"body"`
	IsEdited       bool              `json:"is_edited"`
	CreatedAt      time.Time         `json:"created_at"`
	ReplyToID      *uuid.UUID        `json:"reply_to_id,omitempty"`
	ReplyToBody    string            `json:"reply_to_body,omitempty"`
	Reactions      []MessageReaction `json:"reactions,omitempty"`
}

// MessageReaction represents grouped emoji reactions for a message.
type MessageReaction struct {
	Emoji string `json:"emoji"`
	Count int    `json:"count"`
	Me    bool   `json:"me"` // True if the requesting user applied this reaction
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

// ──────────────────────────────────────────────────────────────
// Friend System
// ──────────────────────────────────────────────────────────────

// Friendship represents a relationship between two users.
// Status state machine: pending → accepted | blocked.
// Maps to friendships table in 011_friends_and_notifications.sql.
type Friendship struct {
	ID          uuid.UUID `json:"id"`
	RequesterID uuid.UUID `json:"requester_id"`
	AddresseeID uuid.UUID `json:"addressee_id"`
	Status      string    `json:"status"` // "pending" | "accepted" | "blocked"
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// FriendWithProfile extends Friendship with the peer's public profile info.
// Returned by GET /api/friends for the full friends list with avatars.
type FriendWithProfile struct {
	Friendship
	PeerID       uuid.UUID  `json:"peer_id"`
	PeerUsername string     `json:"peer_username"`
	PeerName     string     `json:"peer_name"`
	PeerAvatar   string     `json:"peer_avatar"`
	IsOnline     bool       `json:"is_online,omitempty"`
	LastActiveAt *time.Time `json:"last_active_at,omitempty"`
}

// FriendRequest represents a pending incoming friend request with actor info.
// Returned by GET /api/friends/requests.
type FriendRequest struct {
	Friendship
	RequesterUsername string `json:"requester_username"`
	RequesterName     string `json:"requester_name"`
	RequesterAvatar   string `json:"requester_avatar"`
}

// ──────────────────────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────────────────────

// Notification represents an in-app notification delivered to a user.
// Maps to the notifications table in 011_friends_and_notifications.sql.
//
// Types:
//   - friend_request   → actor sent you a friend request
//   - friend_accepted  → actor accepted your friend request
//   - profile_approved → moderator approved your profile update
//   - mod_action       → a moderation action was taken on your account
type Notification struct {
	ID          uuid.UUID              `json:"id"`
	UserID      uuid.UUID              `json:"user_id"`
	Type        string                 `json:"type"`
	ActorID     *uuid.UUID             `json:"actor_id,omitempty"`
	ActorName   string                 `json:"actor_name,omitempty"`
	ActorAvatar string                 `json:"actor_avatar,omitempty"`
	Data        map[string]interface{} `json:"data"`
	IsRead      bool                   `json:"is_read"`
	CreatedAt   time.Time              `json:"created_at"`
}

// ──────────────────────────────────────────────────────────────
// Moderation
// ──────────────────────────────────────────────────────────────

// ProfileReview represents a profile update submitted for moderator review.
// Maps to the profile_reviews table in 011_friends_and_notifications.sql.
type ProfileReview struct {
	ID              uuid.UUID              `json:"id"`
	UserID          uuid.UUID              `json:"user_id"`
	ReviewerID      *uuid.UUID             `json:"reviewer_id,omitempty"`
	OldData         map[string]interface{} `json:"old_data"`
	NewData         map[string]interface{} `json:"new_data"`
	Status          string                 `json:"status"` // "pending" | "approved" | "rejected"
	RejectionReason *string                `json:"rejection_reason,omitempty"`
	CreatedAt       time.Time              `json:"created_at"`
	ReviewedAt      *time.Time             `json:"reviewed_at,omitempty"`
	// Joined fields populated by query
	UserUsername string `json:"user_username,omitempty"`
	UserAvatar   string `json:"user_avatar,omitempty"`
}
