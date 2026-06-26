// ═══════════════════════════════════════════════════════════════
// File:         internal/db/queries.go
// Purpose:      Typed SQL query methods for all database operations
// Dependencies: github.com/jackc/pgx/v5, github.com/google/uuid,
//               internal/models
// Role:         Data-access layer isolating all SQL from the HTTP
//               transport layer. Every database interaction flows
//               through the Store struct. Handlers in internal/api
//               call Store methods and never construct SQL directly.
//               All methods accept context.Context for cancellation
//               and timeout propagation.
// ═══════════════════════════════════════════════════════════════

package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"lynxus/internal/models"
)

// Store wraps a PostgreSQL connection pool and a Redis client, providing typed
// query methods for all database operations. It is the single
// entry point for data access throughout the application.
type Store struct {
	Pool  *pgxpool.Pool
	Redis *redis.Client
}

// NewStore creates a new Store backed by the provided connection pool and redis client.
//
// Parameters:
//   - pool: An initialized pgxpool.Pool (created via db.NewPool).
//   - rdb: An initialized redis.Client.
//
// Returns:
//   - *Store: Ready for concurrent use across goroutines.
func NewStore(pool *pgxpool.Pool, rdb *redis.Client) *Store {
	return &Store{Pool: pool, Redis: rdb}
}

// ──────────────────────────────────────────────────────────────
// Internal Helpers
// ──────────────────────────────────────────────────────────────

// userColumns is the canonical SELECT column list for the users table.
// Uses COALESCE to convert NULLable columns to empty strings,
// ensuring the Go scanner never encounters unexpected NULLs.
const userColumns = `
	id, username, email, password_hash,
	COALESCE(display_name, '') AS display_name,
	COALESCE(avatar_url, '')  AS avatar_url,
	COALESCE(bio, '')         AS bio,
	gender, location, language, interests,
	is_vip, is_admin, is_moderator, is_developer, shadowbanned,
	COALESCE(public_key, '') AS public_key,
	COALESCE(encrypted_private_key, '') AS encrypted_private_key,
	COALESCE(device_fingerprint, '') AS device_fingerprint,
	COALESCE(strike_count, 0) AS strike_count,
	banned_until,
	COALESCE(is_anonymous, false) AS is_anonymous,
	expires_at,
	created_at, updated_at`

// scanUser scans a single row matching the userColumns layout
// into a models.User struct. Guarantees Interests is never nil.
func scanUser(row pgx.Row) (*models.User, error) {
	var u models.User
	err := row.Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash,
		&u.DisplayName, &u.AvatarURL, &u.Bio,
		&u.Gender, &u.Location, &u.Language, &u.Interests,
		&u.IsVIP, &u.IsAdmin, &u.IsModerator, &u.IsDeveloper, &u.Shadowbanned,
		&u.PublicKey, &u.EncryptedPrivateKey,
		&u.DeviceFingerprint, &u.StrikeCount, &u.BannedUntil,
		&u.IsAnonymous, &u.ExpiresAt,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	// Normalize nil slice to empty slice for consistent JSON output
	if u.Interests == nil {
		u.Interests = []string{}
	}
	return &u, nil
}

// ══════════════════════════════════════════════════════════════
// USER OPERATIONS
// ══════════════════════════════════════════════════════════════

// CreateUser inserts a new user with the given credentials.
//
// Parameters:
//   - ctx:          Request context for cancellation/timeout.
//   - id:           The user's UUID (from Supabase Auth).
//   - username:     Unique username (3-32 characters).
//   - email:        Unique email address (lowercased by caller).
//   - passwordHash:        Placeholder password hash (empty string or legacy hash).
//   - publicKey:           E2EE public key.
//   - encryptedPrivateKey: E2EE private key encrypted with password-derived AES key.
//
// Returns:
//   - *models.User: The newly created user with all default values populated.
//   - error:        Non-nil on duplicate key violation or connection failure.
func (s *Store) CreateUser(ctx context.Context, id uuid.UUID, username, email, passwordHash, publicKey, encryptedPrivateKey string) (*models.User, error) {
	row := s.Pool.QueryRow(ctx, `
		INSERT INTO users (id, username, email, password_hash, public_key, encrypted_private_key)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING `+userColumns,
		id, username, email, passwordHash, publicKey, encryptedPrivateKey,
	)
	return scanUser(row)
}

// GetUserByEmail retrieves a user by their email address.
//
// Parameters:
//   - ctx:   Request context.
//   - email: The email to look up (should be lowercased by caller).
//
// Returns:
//   - *models.User: The matching user, or nil if not found.
//   - error:        Non-nil only on database errors (not on "not found").
func (s *Store) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	row := s.Pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE email = $1`, email)
	user, err := scanUser(row)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return user, err
}

// GetUserByID retrieves a user by their UUID.
//
// Parameters:
//   - ctx: Request context.
//   - id:  The user's UUID primary key.
//
// Returns:
//   - *models.User: The matching user, or nil if not found.
//   - error:        Non-nil only on database errors (not on "not found").
func (s *Store) GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	row := s.Pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE id = $1`, id)
	user, err := scanUser(row)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return user, err
}

// GetUserByUsername retrieves a user by their exact username (case-insensitive in PostgreSQL via citext or ILIKE).
//
// Parameters:
//   - ctx: Request context.
//   - username: The username to look up.
//
// Returns:
//   - *models.User: The matching user, or nil if not found.
//   - error:        Non-nil only on database errors.
func (s *Store) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	row := s.Pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE username = $1`, username)
	user, err := scanUser(row)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return user, err
}

// UpdateUserProfile updates all editable profile fields for a user.
// The caller must supply current values for unchanged fields (this
// is a full-replacement update, not a partial patch).
//
// Parameters:
//   - ctx:         Request context.
//   - id:          The user's UUID.
//   - displayName: New display name (may be empty).
//   - avatarURL:   New avatar URL (may be empty).
//   - bio:         New biography text.
//   - gender:      Must be one of: male, female, other, unspecified.
//   - location:    ISO 3166 country code or city name.
//   - language:    BCP-47 language tag (e.g., "en", "fr").
//   - interests:   Slice of interest tags (may be empty).
//   - publicKey:   Base64 encoded public key (may be empty).
//
// Returns:
//   - *models.User: The updated user with all fields.
//   - error:        Non-nil on validation failure or connection error.
func (s *Store) UpdateUserProfile(
	ctx context.Context, id uuid.UUID,
	displayName, avatarURL, bio, gender, location, language string,
	interests []string, publicKey string,
) (*models.User, error) {
	row := s.Pool.QueryRow(ctx, `
		UPDATE users SET
			display_name = $2, avatar_url = $3, bio = $4,
			gender = $5, location = $6, language = $7, interests = $8,
			public_key = $9
		WHERE id = $1
		RETURNING `+userColumns,
		id, displayName, avatarURL, bio, gender, location, language, interests, publicKey,
	)
	return scanUser(row)
}

// UpdateUserInterests updates ONLY the interests column for a user.
// Used by the matchmaker when a user supplies interests on the match screen.
// This is intentionally narrow — it does NOT touch display_name, avatar_url,
// or bio, which go through the profile review queue. Calling UpdateUserProfile
// from the matchmaker path would pass the current DB values for those fields
// back, potentially overwriting a pending review with stale data.
func (s *Store) UpdateUserInterests(ctx context.Context, id uuid.UUID, interests []string) error {
	if interests == nil {
		interests = []string{}
	}
	tag, err := s.Pool.Exec(ctx,
		`UPDATE users SET interests = $2, updated_at = NOW() WHERE id = $1`, id, interests)
	if err != nil {
		return fmt.Errorf("db: failed to update interests: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: user %s not found", id)
	}
	return nil
}

// SetUserVIP updates the is_vip flag for a user by their UUID.
// Called by the Stripe webhook handler after a successful payment.
//
// Parameters:
//   - ctx:   Request context.
//   - id:    The user's UUID.
//   - isVIP: The new VIP status.
//
// Returns:
//   - error: Non-nil if the user is not found or the update fails.
func (s *Store) SetUserVIP(ctx context.Context, id uuid.UUID, isVIP bool) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE users SET is_vip = $2 WHERE id = $1`, id, isVIP)
	if err != nil {
		return fmt.Errorf("db: failed to update VIP status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: user %s not found", id)
	}
	return nil
}

// SetUserVIPByEmail updates the is_vip flag for a user by email.
// Fallback method when user_id metadata is unavailable in the
// Stripe webhook and only customer_email is present.
//
// Parameters:
//   - ctx:   Request context.
//   - email: The user's email address.
//   - isVIP: The new VIP status.
//
// Returns:
//   - error: Non-nil if no user has that email or the update fails.
func (s *Store) SetUserVIPByEmail(ctx context.Context, email string, isVIP bool) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE users SET is_vip = $2 WHERE email = $1`, email, isVIP)
	if err != nil {
		return fmt.Errorf("db: failed to update VIP by email: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: user with email %s not found", email)
	}
	return nil
}

// UpdateUserFingerprint records the user's device fingerprint.
func (s *Store) UpdateUserFingerprint(ctx context.Context, id uuid.UUID, fingerprint string) error {
	_, err := s.Pool.Exec(ctx, `UPDATE users SET device_fingerprint = $2 WHERE id = $1`, id, fingerprint)
	return err
}

// UpdateLastActive updates the last_active_at timestamp for a user.
func (s *Store) UpdateLastActive(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE users
		SET last_active_at = NOW()
		WHERE id = $1
	`
	_, err := s.Pool.Exec(ctx, query, id)
	return err
}

// LogUserStrike increments a user's strike count and issues an escalating ban.
func (s *Store) LogUserStrike(ctx context.Context, id uuid.UUID) (*time.Time, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var strikes int
	var fp string
	err = tx.QueryRow(ctx, `SELECT strike_count, device_fingerprint FROM users WHERE id = $1 FOR UPDATE`, id).Scan(&strikes, &fp)
	if err != nil {
		return nil, err
	}

	strikes++
	
	// Escalation: 15m -> 24h -> 7d
	var banDuration time.Duration
	switch strikes {
	case 1:
		banDuration = 15 * time.Minute
	case 2:
		banDuration = 24 * time.Hour
	default:
		banDuration = 7 * 24 * time.Hour
	}
	
	bannedUntil := time.Now().Add(banDuration)

	_, err = tx.Exec(ctx, `UPDATE users SET strike_count = $2, banned_until = $3 WHERE id = $1`, id, strikes, bannedUntil)
	if err != nil {
		return nil, err
	}

	// Ban the device as well
	if fp != "" {
		_, err = tx.Exec(ctx, `
			INSERT INTO device_bans (fingerprint, banned_until, reason) 
			VALUES ($1, $2, 'AI Moderation Strike Escalation')
			ON CONFLICT (fingerprint) DO UPDATE SET banned_until = GREATEST(device_bans.banned_until, EXCLUDED.banned_until)
		`, fp, bannedUntil)
		if err != nil {
			return nil, err
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &bannedUntil, nil
}

// CheckDeviceBan checks if a given fingerprint is currently banned.
func (s *Store) CheckDeviceBan(ctx context.Context, fingerprint string) (bool, error) {
	if fingerprint == "" {
		return false, nil
	}
	var bannedUntil time.Time
	err := s.Pool.QueryRow(ctx, `SELECT banned_until FROM device_bans WHERE fingerprint = $1`, fingerprint).Scan(&bannedUntil)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return time.Now().Before(bannedUntil), nil
}

// ══════════════════════════════════════════════════════════════
// FEED OPERATIONS
// ══════════════════════════════════════════════════════════════

// CreateFeedPost inserts a new post into the global feed.
//
// Parameters:
//   - ctx:      Request context.
//   - authorID: The UUID of the authenticated user creating the post.
//   - body:     The post text content (must be non-empty, max 5000 chars).
//
// Returns:
//   - *models.FeedPost: The created post with generated ID and timestamp.
//   - error:            Non-nil on constraint violation or connection error.
func (s *Store) CreateFeedPost(ctx context.Context, authorID uuid.UUID, body string) (*models.FeedPost, error) {
	var p models.FeedPost
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO feed_posts (author_id, body)
		VALUES ($1, $2)
		RETURNING id, author_id, body, created_at`,
		authorID, body,
	).Scan(&p.ID, &p.AuthorID, &p.Body, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("db: failed to create feed post: %w", err)
	}
	return &p, nil
}

// GetFeedPosts retrieves cursor-paginated global feed posts with
// their author information joined.
//
// Parameters:
//   - ctx:    Request context.
//   - cursor: Only posts created before this timestamp are returned.
//             Pass time.Now() for the first page.
//   - limit:  Maximum number of posts to return (clamped to 1-100,
//             defaults to 20 if out of range).
//
// Returns:
//   - []models.FeedPost: Posts ordered newest-first with Author populated.
//   - error:             Non-nil on query or scan failure.
func (s *Store) GetFeedPosts(ctx context.Context, cursor time.Time, limit int) ([]models.FeedPost, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	rows, err := s.Pool.Query(ctx, `
		SELECT
			fp.id, fp.author_id, fp.body, fp.created_at,
			u.id, u.username,
			COALESCE(u.display_name, '') AS display_name,
			COALESCE(u.avatar_url, '')   AS avatar_url
		FROM feed_posts fp
		JOIN users u ON u.id = fp.author_id
		WHERE fp.created_at < $1
		ORDER BY fp.created_at DESC
		LIMIT $2`,
		cursor, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query feed posts: %w", err)
	}
	defer rows.Close()

	var posts []models.FeedPost
	for rows.Next() {
		var p models.FeedPost
		var author models.User
		err := rows.Scan(
			&p.ID, &p.AuthorID, &p.Body, &p.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL,
		)
		if err != nil {
			return nil, fmt.Errorf("db: failed to scan feed post: %w", err)
		}
		author.Interests = []string{}
		p.Author = &author
		posts = append(posts, p)
	}

	// Guarantee non-nil slice for consistent JSON serialization
	if posts == nil {
		posts = []models.FeedPost{}
	}
	return posts, rows.Err()
}

// ══════════════════════════════════════════════════════════════
// MESSAGE OPERATIONS
// ══════════════════════════════════════════════════════════════

// CreateMessage inserts a text message into a conversation.
//
// Parameters:
//   - ctx:            Request context.
//   - conversationID: The conversation to post into.
//   - senderID:       The authenticated user sending the message.
//   - body:           Message text (must be non-empty).
//
// Returns:
//   - *models.Message: The persisted message with generated ID and timestamp.
//   - error:           Non-nil on FK violation or connection error.
func (s *Store) CreateMessage(ctx context.Context, conversationID, senderID uuid.UUID, body string, replyToID *uuid.UUID) (*models.Message, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("db: failed to begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var m models.Message
	err = tx.QueryRow(ctx, `
		INSERT INTO messages (conversation_id, sender_id, body, reply_to_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, conversation_id, sender_id, body, is_edited, created_at, reply_to_id`,
		conversationID, senderID, body, replyToID,
	).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.IsEdited, &m.CreatedAt, &m.ReplyToID)
	if err != nil {
		return nil, fmt.Errorf("db: failed to create message: %w", err)
	}

	// Also ensure the sender is a member of the conversation
	_, err = tx.Exec(ctx, `
		INSERT INTO conversation_members (conversation_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`,
		conversationID, senderID,
	)
	if err != nil {
		return nil, fmt.Errorf("db: failed to add member: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("db: failed to commit tx: %w", err)
	}

	return &m, nil
}

// GetMessages retrieves cursor-paginated messages for a conversation.
//
// Parameters:
//   - ctx:            Request context.
//   - conversationID: The conversation to query.
//   - cursor:         Only messages created before this timestamp are returned.
//   - limit:          Maximum messages to return (clamped to 1-100, default 50).
//
// Returns:
//   - []models.Message: Messages ordered newest-first.
//   - error:            Non-nil on query failure.
func (s *Store) GetMessages(ctx context.Context, requestingUserID uuid.UUID, conversationID uuid.UUID, cursor time.Time, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	rows, err := s.Pool.Query(ctx, `
		SELECT m.id, m.conversation_id, m.sender_id, m.body, m.is_edited, m.created_at, m.reply_to_id,
		       COALESCE(NULLIF(u.display_name, ''), NULLIF(u.username, ''), 'User') AS sender_name,
		       COALESCE(r.body, '') AS reply_to_body,
		       COALESCE(
		           (SELECT json_agg(json_build_object('emoji', rx.emoji, 'count', rx.count, 'me', rx.me))
		            FROM (
		                SELECT emoji, count(*) as count, bool_or(user_id = $4) as me
		                FROM message_reactions
		                WHERE message_id = m.id
		                GROUP BY emoji
		            ) rx
		           ), '[]'::json) AS reactions
		FROM messages m
		LEFT JOIN users u ON m.sender_id = u.id
		LEFT JOIN messages r ON m.reply_to_id = r.id
		WHERE m.conversation_id = $1 AND m.created_at < $2
		  AND m.sender_id NOT IN (
		      SELECT blocked_id FROM user_blocks WHERE blocker_id = $4
		      UNION
		      SELECT blocker_id FROM user_blocks WHERE blocked_id = $4
		  )
		ORDER BY m.created_at DESC
		LIMIT $3`,
		conversationID, cursor, limit, requestingUserID,
	)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query messages: %w", err)
	}
	defer rows.Close()

	var msgs []models.Message
	for rows.Next() {
		var m models.Message
		var senderName *string
		var reactionsJSON []byte
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.IsEdited, &m.CreatedAt, &m.ReplyToID, &senderName, &m.ReplyToBody, &reactionsJSON); err != nil {
			return nil, fmt.Errorf("db: failed to scan message: %w", err)
		}
		if senderName != nil {
			m.SenderName = *senderName
		}
		if len(reactionsJSON) > 0 {
			json.Unmarshal(reactionsJSON, &m.Reactions)
		}
		msgs = append(msgs, m)
	}

	if msgs == nil {
		msgs = []models.Message{}
	}
	return msgs, rows.Err()
}

// UpdateMessage updates a message's body and sets is_edited to true.
func (s *Store) UpdateMessage(ctx context.Context, id uuid.UUID, senderID uuid.UUID, newBody string) error {
	cmd, err := s.Pool.Exec(ctx, `
		UPDATE messages
		SET body = $1, is_edited = true
		WHERE id = $2 AND sender_id = $3
	`, newBody, id, senderID)
	if err != nil {
		return fmt.Errorf("db: failed to update message: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return fmt.Errorf("db: message not found or unauthorized")
	}
	return nil
}

// ── User Blocking and Reporting ─────────────────────────────────

// BlockUser adds a block relationship.
func (s *Store) BlockUser(ctx context.Context, blockerID, blockedID uuid.UUID) error {
	if blockerID == blockedID {
		return fmt.Errorf("db: cannot block self")
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO user_blocks (blocker_id, blocked_id) 
		VALUES ($1, $2) ON CONFLICT DO NOTHING
	`, blockerID, blockedID)
	return err
}

// UnblockUser removes a block relationship.
func (s *Store) UnblockUser(ctx context.Context, blockerID, blockedID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `
		DELETE FROM user_blocks 
		WHERE blocker_id = $1 AND blocked_id = $2
	`, blockerID, blockedID)
	return err
}

// ReportUser files a new report.
func (s *Store) ReportUser(ctx context.Context, reporterID, reportedID uuid.UUID, messageID *uuid.UUID, reason string, proofURL *string) error {
	if reporterID == reportedID {
		return fmt.Errorf("db: cannot report self")
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO user_reports (reporter_id, reported_id, message_id, reason, proof_url)
		VALUES ($1, $2, $3, $4, $5)
	`, reporterID, reportedID, messageID, reason, proofURL)
	return err
}

// DeleteMessage deletes a message from the database.
func (s *Store) DeleteMessage(ctx context.Context, id uuid.UUID, senderID uuid.UUID) error {
	cmd, err := s.Pool.Exec(ctx, `
		DELETE FROM messages
		WHERE id = $1 AND sender_id = $2
	`, id, senderID)
	if err != nil {
		return fmt.Errorf("db: failed to delete message: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return fmt.Errorf("db: message not found or unauthorized")
	}
	return nil
}

// ToggleMessageReaction adds or removes a reaction from a message.
// Returns a boolean indicating if the reaction was added (true) or removed (false).
func (s *Store) ToggleMessageReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) (bool, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("db: failed to begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Check if the reaction already exists
	var exists bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3)
	`, messageID, userID, emoji).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("db: failed to check reaction: %w", err)
	}

	if exists {
		// Remove it
		_, err = tx.Exec(ctx, `
			DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3
		`, messageID, userID, emoji)
		if err != nil {
			return false, fmt.Errorf("db: failed to delete reaction: %w", err)
		}
	} else {
		// Add it
		_, err = tx.Exec(ctx, `
			INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
		`, messageID, userID, emoji)
		if err != nil {
			return false, fmt.Errorf("db: failed to insert reaction: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("db: failed to commit tx: %w", err)
	}

	return !exists, nil
}

// GetMessageReactions fetches reactions for a specific message, grouped by emoji.
func (s *Store) GetMessageReactions(ctx context.Context, requestingUserID, messageID uuid.UUID) ([]models.MessageReaction, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT emoji, count(*) as count, bool_or(user_id = $1) as me
		FROM message_reactions
		WHERE message_id = $2
		GROUP BY emoji
	`, requestingUserID, messageID)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query message reactions: %w", err)
	}
	defer rows.Close()

	var reactions []models.MessageReaction
	for rows.Next() {
		var rx models.MessageReaction
		if err := rows.Scan(&rx.Emoji, &rx.Count, &rx.Me); err != nil {
			return nil, fmt.Errorf("db: failed to scan reaction: %w", err)
		}
		reactions = append(reactions, rx)
	}
	if reactions == nil {
		reactions = []models.MessageReaction{}
	}
	return reactions, rows.Err()
}

// ClearConversationMessages deletes all messages in a specific conversation.
func (s *Store) ClearConversationMessages(ctx context.Context, conversationID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `
		DELETE FROM messages
		WHERE conversation_id = $1
	`, conversationID)
	if err != nil {
		return fmt.Errorf("db: failed to clear conversation messages: %w", err)
	}
	return nil
}

// ══════════════════════════════════════════════════════════════
// DM / CONVERSATION OPERATIONS
// ══════════════════════════════════════════════════════════════

// GetOrCreateDM returns the conversation ID for a DM between two
// users, creating one atomically if it does not yet exist. Delegates
// to the get_or_create_dm() PostgreSQL function defined in
// 004_create_dm_conversations.sql which enforces the unique-pair
// constraint (smaller UUID always stored as user_a).
//
// Parameters:
//   - ctx:   Request context.
//   - userA: One participant's UUID.
//   - userB: The other participant's UUID.
//
// Returns:
//   - uuid.UUID: The conversation ID (existing or newly created).
//   - error:     Non-nil on FK violation or connection error.
func (s *Store) GetOrCreateDM(ctx context.Context, userA, userB uuid.UUID) (uuid.UUID, error) {
	var convID uuid.UUID
	err := s.Pool.QueryRow(ctx,
		`SELECT get_or_create_dm($1, $2)`, userA, userB,
	).Scan(&convID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("db: failed to get/create DM: %w", err)
	}
	return convID, nil
}

// IsConversationMember checks whether a user belongs to a conversation.
// Used for authorization before fetching messages.
//
// Parameters:
//   - ctx:            Request context.
//   - conversationID: The conversation to check.
//   - userID:         The user to verify membership for.
//
// Returns:
//   - bool:  True if the user is a member.
//   - error: Non-nil on query failure.
func (s *Store) IsConversationMember(ctx context.Context, conversationID, userID uuid.UUID) (bool, error) {
	var exists bool
	err := s.Pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM conversation_members
			WHERE conversation_id = $1 AND user_id = $2
		)`, conversationID, userID,
	).Scan(&exists)
	return exists, err
}

// CheckPublicGroupAccess checks if the conversation is a public group.
// Used for frictionless public group chat access.
func (s *Store) CheckPublicGroupAccess(ctx context.Context, conversationID, userID uuid.UUID) (bool, error) {
	var convType string
	err := s.Pool.QueryRow(ctx, `SELECT type FROM conversations WHERE id = $1`, conversationID).Scan(&convType)
	if err != nil {
		if err == pgx.ErrNoRows {
			return false, nil // Conversation doesn't exist
		}
		return false, fmt.Errorf("db: failed to get conversation type: %w", err)
	}

	if convType == "group" {
		return true, nil
	}

	// For DMs or other types, strictly enforce membership
	return s.IsConversationMember(ctx, conversationID, userID)
}

// GetUserConversations retrieves all conversations for a user,
// ordered by most recent activity (last message timestamp), with
// a preview of the latest message.
//
// Parameters:
//   - ctx:    Request context.
//   - userID: The authenticated user's UUID.
//
// Returns:
//   - []models.ConversationSummary: Conversations with last-message preview.
//   - error:                        Non-nil on query failure.
func (s *Store) GetUserConversations(ctx context.Context, userID uuid.UUID) ([]models.ConversationSummary, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT
			c.id, c.type, COALESCE(c.name, '') AS name, c.created_at,
			COALESCE(
				(SELECT body FROM messages
				 WHERE conversation_id = c.id
				 ORDER BY created_at DESC LIMIT 1),
				''
			) AS last_message,
			(SELECT created_at FROM messages
			 WHERE conversation_id = c.id
			 ORDER BY created_at DESC LIMIT 1
			) AS last_message_at,
			(SELECT sender_id FROM messages
			 WHERE conversation_id = c.id
			 ORDER BY created_at DESC LIMIT 1
			) AS last_message_sender_id
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id
		WHERE cm.user_id = $1
		ORDER BY COALESCE(
			(SELECT created_at FROM messages
			 WHERE conversation_id = c.id
			 ORDER BY created_at DESC LIMIT 1),
			c.created_at
		) DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query conversations: %w", err)
	}
	defer rows.Close()

	var summaries []models.ConversationSummary
	for rows.Next() {
		var cs models.ConversationSummary
		if err := rows.Scan(
			&cs.ID, &cs.Type, &cs.Name, &cs.CreatedAt,
			&cs.LastMessage, &cs.LastMessageAt, &cs.LastMessageSenderID,
		); err != nil {
			return nil, fmt.Errorf("db: failed to scan conversation: %w", err)
		}
		summaries = append(summaries, cs)
	}

	if summaries == nil {
		summaries = []models.ConversationSummary{}
	}
	return summaries, rows.Err()
}

// ──────────────────────────────────────────────────────────────
// DM & GROUP CHAT DISCOVERY
// ──────────────────────────────────────────────────────────────

// GetAllGroups retrieves all group chats available on the server.
func (s *Store) GetAllGroups(ctx context.Context) ([]models.Conversation, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT c.id, c.type, COALESCE(c.name, '') AS name, 
		       COALESCE(c.description, '') AS description, 
		       COALESCE(c.is_nsfw, false) AS is_nsfw, 
		       COALESCE(c.slowmode_seconds, 0) AS slowmode_seconds, 
		       c.created_at
		FROM conversations c
		WHERE c.type = 'group'
		ORDER BY c.created_at ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query groups: %w", err)
	}
	defer rows.Close()

	var groups []models.Conversation
	for rows.Next() {
		var c models.Conversation
		if err := rows.Scan(&c.ID, &c.Type, &c.Name, &c.Description, &c.IsNSFW, &c.SlowmodeSeconds, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("db: failed to scan group: %w", err)
		}
		
		// Fetch live presence count from Redis
		count, _ := s.GetRoomPresenceCount(ctx, c.ID.String())
		c.MemberCount = count
		
		groups = append(groups, c)
	}
	if groups == nil {
		groups = []models.Conversation{}
	}
	return groups, rows.Err()
}

// DMConversation extends ConversationSummary with peer user info.
type DMConversation struct {
	models.ConversationSummary
	PeerID       uuid.UUID `json:"peer_id"`
	PeerName     string    `json:"peer_name"`
	PeerAvatar   string    `json:"peer_avatar"`
	PeerPublicKey string   `json:"peer_public_key"`
}

// GetUserDMs retrieves a user's DM conversations, including the peer's profile info.
func (s *Store) GetUserDMs(ctx context.Context, userID uuid.UUID) ([]DMConversation, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT
			c.id, c.type, c.created_at,
			COALESCE((SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1), '') AS last_message,
			(SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
			(SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_sender_id,
			u.id AS peer_id,
			COALESCE(NULLIF(u.display_name, ''), u.username) AS peer_name,
			COALESCE(u.avatar_url, '') AS peer_avatar,
			COALESCE(u.public_key, '') AS peer_public_key,
			u.last_active_at
		FROM conversations c
		JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = $1
		JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id != $1
		JOIN users u ON u.id = cm2.user_id
		WHERE c.type = 'dm'
		ORDER BY COALESCE(
			(SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
			c.created_at
		) DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query user DMs: %w", err)
	}
	defer rows.Close()

	var dms []DMConversation
	for rows.Next() {
		var dm DMConversation
		if err := rows.Scan(
			&dm.ID, &dm.Type, &dm.CreatedAt,
			&dm.LastMessage, &dm.LastMessageAt, &dm.LastMessageSenderID,
			&dm.PeerID, &dm.PeerName, &dm.PeerAvatar, &dm.PeerPublicKey,
			&dm.LastActiveAt,
		); err != nil {
			return nil, fmt.Errorf("db: failed to scan user DM: %w", err)
		}
		dm.Name = dm.PeerName // Conveniently set the conversation name to the peer's name
		dms = append(dms, dm)
	}
	if dms == nil {
		dms = []DMConversation{}
	}
	return dms, rows.Err()
}

// GetConversationMembers retrieves all members of a conversation, ordered by VIP/Admin status and then username.
func (s *Store) GetConversationMembers(ctx context.Context, conversationID uuid.UUID) ([]models.User, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT `+userColumns+`
		FROM users u
		JOIN conversation_members cm ON cm.user_id = u.id
		WHERE cm.conversation_id = $1
		ORDER BY u.is_admin DESC, u.is_moderator DESC, u.is_vip DESC, u.username ASC
	`, conversationID)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query conversation members: %w", err)
	}
	defer rows.Close()

	var members []models.User
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("db: failed to scan member: %w", err)
		}
		members = append(members, *user)
	}
	if members == nil {
		members = []models.User{}
	}
	return members, rows.Err()
}

// GetUsersByIDs retrieves a list of users by their UUIDs, ordered by VIP/Admin status and then username.
func (s *Store) GetUsersByIDs(ctx context.Context, userIDs []uuid.UUID) ([]models.User, error) {
	if len(userIDs) == 0 {
		return []models.User{}, nil
	}

	rows, err := s.Pool.Query(ctx, `
		SELECT `+userColumns+`
		FROM users
		WHERE id = ANY($1)
		ORDER BY is_admin DESC, is_moderator DESC, is_vip DESC, username ASC
	`, userIDs)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query users by IDs: %w", err)
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("db: failed to scan user: %w", err)
		}
		u.PasswordHash = "" // Clear sensitive data
		users = append(users, *u)
	}
	if users == nil {
		users = []models.User{}
	}
	return users, rows.Err()
}

// SearchUsers finds users matching a query by username or display_name.
func (s *Store) SearchUsers(ctx context.Context, query string) ([]models.User, error) {
	searchPattern := "%" + query + "%"
	rows, err := s.Pool.Query(ctx, `
		SELECT `+userColumns+` FROM users
		WHERE username ILIKE $1 OR display_name ILIKE $1
		ORDER BY is_vip DESC, username ASC
		LIMIT 20
	`, searchPattern)
	if err != nil {
		return nil, fmt.Errorf("db: failed to search users: %w", err)
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("db: failed to scan searched user: %w", err)
		}
		users = append(users, *u)
	}
	if users == nil {
		users = []models.User{}
	}
	return users, rows.Err()
}

// CreateGroup creates a new group conversation.
func (s *Store) CreateGroup(ctx context.Context, name, description string, isNSFW bool, slowmode int) (models.Conversation, error) {
	var c models.Conversation
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO conversations (type, name, description, is_nsfw, slowmode_seconds)
		VALUES ('group', $1, $2, $3, $4)
		RETURNING id, type, COALESCE(name, '') AS name, COALESCE(description, '') AS description, COALESCE(is_nsfw, false) AS is_nsfw, COALESCE(slowmode_seconds, 0) AS slowmode_seconds, created_at
	`, name, description, isNSFW, slowmode).Scan(&c.ID, &c.Type, &c.Name, &c.Description, &c.IsNSFW, &c.SlowmodeSeconds, &c.CreatedAt)
	if err != nil {
		return models.Conversation{}, fmt.Errorf("db: failed to create group: %w", err)
	}
	return c, nil
}

// UpdateGroup updates the settings of an existing group conversation.
func (s *Store) UpdateGroup(ctx context.Context, id uuid.UUID, name, description string, isNSFW bool, slowmode int) (models.Conversation, error) {
	var c models.Conversation
	err := s.Pool.QueryRow(ctx, `
		UPDATE conversations
		SET name = $1, description = $2, is_nsfw = $3, slowmode_seconds = $4
		WHERE id = $5 AND type = 'group'
		RETURNING id, type, COALESCE(name, '') AS name, COALESCE(description, '') AS description, COALESCE(is_nsfw, false) AS is_nsfw, COALESCE(slowmode_seconds, 0) AS slowmode_seconds, created_at
	`, name, description, isNSFW, slowmode, id).Scan(&c.ID, &c.Type, &c.Name, &c.Description, &c.IsNSFW, &c.SlowmodeSeconds, &c.CreatedAt)
	if err != nil {
		return models.Conversation{}, fmt.Errorf("db: failed to update group: %w", err)
	}
	return c, nil
}

// DeleteGroup deletes a group conversation and all associated messages.
func (s *Store) DeleteGroup(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `
		DELETE FROM conversations WHERE id = $1 AND type = 'group'
	`, id)
	if err != nil {
		return fmt.Errorf("db: failed to delete group: %w", err)
	}
	return nil
}

// ══════════════════════════════════════════════════════════════
// FRIEND SYSTEM
// ══════════════════════════════════════════════════════════════

// SendFriendRequest creates a pending friendship from requester → addressee.
// Returns an error if any blocked relationship exists in either direction.
func (s *Store) SendFriendRequest(ctx context.Context, requesterID, addresseeID uuid.UUID) (*models.Friendship, error) {
	// Pre-check: reject if either party has blocked the other
	var existingStatus string
	err := s.Pool.QueryRow(ctx, `
		SELECT status FROM friendships
		WHERE (requester_id = $1 AND addressee_id = $2)
		   OR (requester_id = $2 AND addressee_id = $1)
		LIMIT 1`,
		requesterID, addresseeID,
	).Scan(&existingStatus)
	if err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("db: send friend request pre-check: %w", err)
	}
	if existingStatus == "blocked" {
		return nil, fmt.Errorf("db: blocked relationship exists")
	}
	if existingStatus == "accepted" || existingStatus == "pending" {
		// Prevent creating a duplicate row in the other direction.
		// (We return an error string that triggers the 409 Conflict handler in the API)
		return nil, fmt.Errorf("db: unique constraint violation: relationship already exists")
	}

	var f models.Friendship
	err = s.Pool.QueryRow(ctx, `
		INSERT INTO friendships (requester_id, addressee_id, status)
		VALUES ($1, $2, 'pending')
		RETURNING id, requester_id, addressee_id, status, created_at, updated_at`,
		requesterID, addresseeID,
	).Scan(&f.ID, &f.RequesterID, &f.AddresseeID, &f.Status, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("db: send friend request: %w", err)
	}
	return &f, nil
}

// AcceptFriendRequest transitions a pending friendship to accepted.
// Only the addressee should call this.
func (s *Store) AcceptFriendRequest(ctx context.Context, requesterID, addresseeID uuid.UUID) (*models.Friendship, error) {
	var f models.Friendship
	err := s.Pool.QueryRow(ctx, `
		UPDATE friendships
		SET status = 'accepted', updated_at = NOW()
		WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
		RETURNING id, requester_id, addressee_id, status, created_at, updated_at`,
		requesterID, addresseeID,
	).Scan(&f.ID, &f.RequesterID, &f.AddresseeID, &f.Status, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("db: accept friend request: %w", err)
	}
	return &f, nil
}

// DeclineFriendRequest deletes a pending friendship (addressee declines).
func (s *Store) DeclineFriendRequest(ctx context.Context, requesterID, addresseeID uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `
		DELETE FROM friendships
		WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
		requesterID, addresseeID,
	)
	if err != nil {
		return fmt.Errorf("db: decline friend request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: friend request not found")
	}
	return nil
}

// CancelFriendRequest deletes a pending friendship sent by the requester (outgoing cancel).
func (s *Store) CancelFriendRequest(ctx context.Context, requesterID, addresseeID uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `
		DELETE FROM friendships
		WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'`,
		requesterID, addresseeID,
	)
	if err != nil {
		return fmt.Errorf("db: cancel friend request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("db: friend request not found or already processed")
	}
	return nil
}

// RemoveFriend deletes an accepted friendship in either direction and the associated DM conversation.
func (s *Store) RemoveFriend(ctx context.Context, userA, userB uuid.UUID) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db: remove friend begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		DELETE FROM friendships
		WHERE status = 'accepted'
		  AND ((requester_id = $1 AND addressee_id = $2)
		    OR (requester_id = $2 AND addressee_id = $1))`,
		userA, userB,
	)
	if err != nil {
		return fmt.Errorf("db: remove friend: %w", err)
	}

	// Deleting from conversations will cascade to messages and dm_pairs
	_, err = tx.Exec(ctx, `
		DELETE FROM conversations
		WHERE id IN (
			SELECT conversation_id 
			FROM dm_pairs 
			WHERE (user_a_id = $1 AND user_b_id = $2)
			   OR (user_a_id = $2 AND user_b_id = $1)
		)
	`, userA, userB)
	if err != nil {
		return fmt.Errorf("db: delete dm on unfriend: %w", err)
	}

	return tx.Commit(ctx)
}

// BlockFriend creates or upgrades a relationship to blocked status.
func (s *Store) BlockFriend(ctx context.Context, blockerID, blockedID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO friendships (requester_id, addressee_id, status)
		VALUES ($1, $2, 'blocked')
		ON CONFLICT (requester_id, addressee_id)
		DO UPDATE SET status = 'blocked', updated_at = NOW()`,
		blockerID, blockedID,
	)
	if err != nil {
		return fmt.Errorf("db: block friend: %w", err)
	}
	return nil
}

// GetFriends returns all accepted friends with peer profile info.
func (s *Store) GetFriends(ctx context.Context, userID uuid.UUID) ([]models.FriendWithProfile, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT
			f.id, f.requester_id, f.addressee_id, f.status, f.created_at, f.updated_at,
			u.id AS peer_id,
			u.username AS peer_username,
			COALESCE(NULLIF(u.display_name,''), u.username) AS peer_name,
			COALESCE(u.avatar_url, '') AS peer_avatar,
			u.last_active_at
		FROM friendships f
		JOIN users u ON u.id = CASE
			WHEN f.requester_id = $1 THEN f.addressee_id
			ELSE f.requester_id
		END
		WHERE (f.requester_id = $1 OR f.addressee_id = $1)
		  AND f.status = 'accepted'
		ORDER BY f.updated_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("db: get friends: %w", err)
	}
	defer rows.Close()

	var friends []models.FriendWithProfile
	for rows.Next() {
		var fw models.FriendWithProfile
		if err := rows.Scan(
			&fw.ID, &fw.RequesterID, &fw.AddresseeID, &fw.Status, &fw.CreatedAt, &fw.UpdatedAt,
			&fw.PeerID, &fw.PeerUsername, &fw.PeerName, &fw.PeerAvatar, &fw.LastActiveAt,
		); err != nil {
			return nil, fmt.Errorf("db: scan friend: %w", err)
		}
		friends = append(friends, fw)
	}
	if friends == nil {
		friends = []models.FriendWithProfile{}
	}
	return friends, rows.Err()
}

// GetFriendRequests returns all pending requests (incoming and outgoing) for a user.
func (s *Store) GetFriendRequests(ctx context.Context, userID uuid.UUID) ([]models.FriendWithProfile, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT
			f.id, f.requester_id, f.addressee_id, f.status, f.created_at, f.updated_at,
			u.id AS peer_id,
			u.username AS peer_username,
			COALESCE(NULLIF(u.display_name,''), u.username) AS peer_name,
			COALESCE(u.avatar_url, '') AS peer_avatar
		FROM friendships f
		JOIN users u ON u.id = CASE
			WHEN f.requester_id = $1 THEN f.addressee_id
			ELSE f.requester_id
		END
		WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'pending'
		ORDER BY f.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("db: get friend requests: %w", err)
	}
	defer rows.Close()

	var requests []models.FriendWithProfile
	for rows.Next() {
		var fw models.FriendWithProfile
		if err := rows.Scan(
			&fw.ID, &fw.RequesterID, &fw.AddresseeID, &fw.Status, &fw.CreatedAt, &fw.UpdatedAt,
			&fw.PeerID, &fw.PeerUsername, &fw.PeerName, &fw.PeerAvatar,
		); err != nil {
			return nil, fmt.Errorf("db: scan friend request: %w", err)
		}
		requests = append(requests, fw)
	}
	if requests == nil {
		requests = []models.FriendWithProfile{}
	}
	return requests, rows.Err()
}

// GetFriendshipStatus returns "none","pending_outgoing","pending_incoming","accepted","blocked".
func (s *Store) GetFriendshipStatus(ctx context.Context, viewerID, targetID uuid.UUID) (string, error) {
	var requesterID, addresseeID uuid.UUID
	var status string
	err := s.Pool.QueryRow(ctx, `
		SELECT requester_id, addressee_id, status FROM friendships
		WHERE (requester_id = $1 AND addressee_id = $2)
		   OR (requester_id = $2 AND addressee_id = $1)
		LIMIT 1`,
		viewerID, targetID,
	).Scan(&requesterID, &addresseeID, &status)
	if err == pgx.ErrNoRows {
		return "none", nil
	}
	if err != nil {
		return "", fmt.Errorf("db: friendship status: %w", err)
	}
	if status == "accepted" {
		return "accepted", nil
	}
	if status == "blocked" {
		return "blocked", nil
	}
	if requesterID == viewerID {
		return "pending_outgoing", nil
	}
	return "pending_incoming", nil
}

// IsFriend checks whether two users have an accepted friendship.
func (s *Store) IsFriend(ctx context.Context, userA, userB uuid.UUID) (bool, error) {
	var exists bool
	err := s.Pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM friendships
			WHERE status = 'accepted'
			  AND ((requester_id = $1 AND addressee_id = $2)
			    OR (requester_id = $2 AND addressee_id = $1))
		)`, userA, userB,
	).Scan(&exists)
	return exists, err
}

// IsFriendCached checks friendship via a 60-second Redis cache to reduce
// DB load on the WS DM hot path. Falls back to IsFriend on cache miss or
// Redis errors. Cache key is symmetric: always sorted (minID, maxID).
// Invalidate by deleting the key when friendship status changes (accept/remove/block).
func (s *Store) IsFriendCached(ctx context.Context, userA, userB uuid.UUID) (bool, error) {
	// Canonical key: sort IDs so A↔B and B↔A hit the same entry
	a, b := userA.String(), userB.String()
	if a > b {
		a, b = b, a
	}
	cacheKey := "friend_cache:" + a + ":" + b

	cached, err := s.Redis.Get(ctx, cacheKey).Result()
	if err == nil {
		return cached == "1", nil
	}

	// Cache miss — query DB
	isFriend, err := s.IsFriend(ctx, userA, userB)
	if err != nil {
		return false, err
	}

	val := "0"
	if isFriend {
		val = "1"
	}
	// 60-second TTL — short enough that unfriend/block takes effect quickly
	s.Redis.Set(ctx, cacheKey, val, 60*time.Second)
	return isFriend, nil
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

// CreateNotificationRaw inserts a notification using a raw JSONB data string.
func (s *Store) CreateNotificationRaw(ctx context.Context, userID uuid.UUID, notifType string, actorID *uuid.UUID, dataJSON string) (*models.Notification, error) {
	var n models.Notification
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO notifications (user_id, type, actor_id, data)
		VALUES ($1, $2, $3, $4::jsonb)
		RETURNING id, user_id, type, actor_id, data, is_read, created_at`,
		userID, notifType, actorID, dataJSON,
	).Scan(&n.ID, &n.UserID, &n.Type, &n.ActorID, &n.Data, &n.IsRead, &n.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("db: create notification: %w", err)
	}
	if n.Data == nil {
		n.Data = map[string]interface{}{}
	}
	return &n, nil
}

// GetNotifications returns recent notifications for a user with actor info.
func (s *Store) GetNotifications(ctx context.Context, userID uuid.UUID, limit int) ([]models.Notification, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT
			n.id, n.user_id, n.type, n.actor_id, n.data, n.is_read, n.created_at,
			COALESCE(NULLIF(u.display_name,''), u.username, '') AS actor_name,
			COALESCE(u.avatar_url, '') AS actor_avatar
		FROM notifications n
		LEFT JOIN users u ON u.id = n.actor_id
		WHERE n.user_id = $1
		ORDER BY n.created_at DESC
		LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("db: get notifications: %w", err)
	}
	defer rows.Close()

	var notifs []models.Notification
	for rows.Next() {
		var n models.Notification
		if err := rows.Scan(
			&n.ID, &n.UserID, &n.Type, &n.ActorID, &n.Data, &n.IsRead, &n.CreatedAt,
			&n.ActorName, &n.ActorAvatar,
		); err != nil {
			return nil, fmt.Errorf("db: scan notification: %w", err)
		}
		if n.Data == nil {
			n.Data = map[string]interface{}{}
		}
		notifs = append(notifs, n)
	}
	if notifs == nil {
		notifs = []models.Notification{}
	}
	return notifs, rows.Err()
}

// GetUnreadNotificationCount returns count of unread notifications.
func (s *Store) GetUnreadNotificationCount(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := s.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
		userID,
	).Scan(&count)
	return count, err
}

// MarkNotificationsRead marks all of a user's notifications as read.
func (s *Store) MarkNotificationsRead(ctx context.Context, userID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx,
		`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
		userID,
	)
	return err
}


// ══════════════════════════════════════════════════════════════
// PROFILE REVIEWS (Moderation Queue)
// ══════════════════════════════════════════════════════════════

// CreateProfileReview queues a profile update for moderator review.
func (s *Store) CreateProfileReview(ctx context.Context, userID uuid.UUID, oldDataJSON, newDataJSON string) (*models.ProfileReview, error) {
	var pr models.ProfileReview
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO profile_reviews (user_id, old_data, new_data)
		VALUES ($1, $2::jsonb, $3::jsonb)
		RETURNING id, user_id, reviewer_id, old_data, new_data, status, rejection_reason, created_at, reviewed_at`,
		userID, oldDataJSON, newDataJSON,
	).Scan(&pr.ID, &pr.UserID, &pr.ReviewerID, &pr.OldData, &pr.NewData,
		&pr.Status, &pr.RejectionReason, &pr.CreatedAt, &pr.ReviewedAt)
	if err != nil {
		return nil, fmt.Errorf("db: create profile review: %w", err)
	}
	return &pr, nil
}

// GetPendingProfileReviews returns all pending reviews for the mod queue.
func (s *Store) GetPendingProfileReviews(ctx context.Context) ([]models.ProfileReview, error) {
	return s.queryProfileReviews(ctx, `WHERE pr.status = 'pending' ORDER BY pr.created_at ASC`)
}

// GetAllProfileReviews returns full review history for mod log.
func (s *Store) GetAllProfileReviews(ctx context.Context, limit int) ([]models.ProfileReview, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return s.queryProfileReviews(ctx, fmt.Sprintf(`ORDER BY pr.created_at DESC LIMIT %d`, limit))
}

func (s *Store) queryProfileReviews(ctx context.Context, whereClause string) ([]models.ProfileReview, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT pr.id, pr.user_id, pr.reviewer_id, pr.old_data, pr.new_data,
			pr.status, pr.rejection_reason, pr.created_at, pr.reviewed_at,
			u.username, COALESCE(u.avatar_url,'') AS user_avatar
		FROM profile_reviews pr
		JOIN users u ON u.id = pr.user_id `+whereClause,
	)
	if err != nil {
		return nil, fmt.Errorf("db: query profile reviews: %w", err)
	}
	defer rows.Close()

	var reviews []models.ProfileReview
	for rows.Next() {
		var pr models.ProfileReview
		if err := rows.Scan(
			&pr.ID, &pr.UserID, &pr.ReviewerID, &pr.OldData, &pr.NewData,
			&pr.Status, &pr.RejectionReason, &pr.CreatedAt, &pr.ReviewedAt,
			&pr.UserUsername, &pr.UserAvatar,
		); err != nil {
			return nil, fmt.Errorf("db: scan profile review: %w", err)
		}
		reviews = append(reviews, pr)
	}
	if reviews == nil {
		reviews = []models.ProfileReview{}
	}
	return reviews, rows.Err()
}

// ApproveProfileReview approves a review, applies changes to the user, returns review.
func (s *Store) ApproveProfileReview(ctx context.Context, reviewID, reviewerID uuid.UUID) (*models.ProfileReview, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var pr models.ProfileReview
	err = tx.QueryRow(ctx, `
		UPDATE profile_reviews
		SET status = 'approved', reviewer_id = $2, reviewed_at = NOW()
		WHERE id = $1 AND status = 'pending'
		RETURNING id, user_id, reviewer_id, old_data, new_data, status, rejection_reason, created_at, reviewed_at`,
		reviewID, reviewerID,
	).Scan(&pr.ID, &pr.UserID, &pr.ReviewerID, &pr.OldData, &pr.NewData,
		&pr.Status, &pr.RejectionReason, &pr.CreatedAt, &pr.ReviewedAt)
	if err != nil {
		return nil, fmt.Errorf("db: approve review: %w", err)
	}

	// Apply new_data to the user
	if pr.NewData != nil {
		displayName, _ := pr.NewData["display_name"].(string)
		avatarURL, _ := pr.NewData["avatar_url"].(string)
		bio, _ := pr.NewData["bio"].(string)
		if displayName != "" || avatarURL != "" || bio != "" {
			_, err = tx.Exec(ctx, `
				UPDATE users SET
					display_name = CASE WHEN $2 != '' THEN $2 ELSE display_name END,
					avatar_url   = CASE WHEN $3 != '' THEN $3 ELSE avatar_url END,
					bio          = CASE WHEN $4 != '' THEN $4 ELSE bio END
				WHERE id = $1`,
				pr.UserID, displayName, avatarURL, bio,
			)
			if err != nil {
				return nil, fmt.Errorf("db: apply profile update: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &pr, nil
}

// RejectProfileReview rejects a pending profile review with a reason.
func (s *Store) RejectProfileReview(ctx context.Context, reviewID, reviewerID uuid.UUID, reason string) (*models.ProfileReview, error) {
	var pr models.ProfileReview
	err := s.Pool.QueryRow(ctx, `
		UPDATE profile_reviews
		SET status = 'rejected', reviewer_id = $2, reviewed_at = NOW(), rejection_reason = $3
		WHERE id = $1 AND status = 'pending'
		RETURNING id, user_id, reviewer_id, old_data, new_data, status, rejection_reason, created_at, reviewed_at`,
		reviewID, reviewerID, reason,
	).Scan(&pr.ID, &pr.UserID, &pr.ReviewerID, &pr.OldData, &pr.NewData,
		&pr.Status, &pr.RejectionReason, &pr.CreatedAt, &pr.ReviewedAt)
	if err != nil {
		return nil, fmt.Errorf("db: reject review: %w", err)
	}
	return &pr, nil
}

// ══════════════════════════════════════════════════════════════
// KEY BACKUP (E2EE)
// ══════════════════════════════════════════════════════════════

// SaveKeyBackup stores the user's encrypted E2EE private key.
func (s *Store) SaveKeyBackup(ctx context.Context, userID uuid.UUID, blob string) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE users
		SET key_backup_blob = $1
		WHERE id = $2
	`, blob, userID)
	if err != nil {
		return fmt.Errorf("db: failed to save key backup: %w", err)
	}
	return nil
}

// GetKeyBackup retrieves the user's encrypted E2EE private key.
func (s *Store) GetKeyBackup(ctx context.Context, userID uuid.UUID) (string, error) {
	var blob string
	err := s.Pool.QueryRow(ctx, `
		SELECT COALESCE(key_backup_blob, '')
		FROM users
		WHERE id = $1
	`, userID).Scan(&blob)
	if err != nil {
		return "", fmt.Errorf("db: failed to get key backup: %w", err)
	}
	return blob, nil
}

// DeleteUser permanently removes a user and all their associated data.
// Runs inside a transaction to atomically:
//  1. Delete DM conversations the user participated in (so the peer's
//     DM list doesn't show a ghost conversation after deletion).
//  2. Delete the users row (FK cascades handle feed_posts, friendships,
//     notifications, profile_reviews, conversation_members, dm_pairs,
//     blocks, reports, etc).
func (s *Store) DeleteUser(ctx context.Context, userID uuid.UUID) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("db: delete user begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Step 1: delete DM conversations this user participated in.
	// conversation_members and dm_pairs both cascade from conversations,
	// so deleting the conversation row cleans those up too. This prevents
	// the peer from seeing a ghost DM thread after account deletion.
	_, err = tx.Exec(ctx, `
		DELETE FROM conversations
		WHERE type = 'dm'
		  AND id IN (
			SELECT conversation_id
			FROM conversation_members
			WHERE user_id = $1
		  )
	`, userID)
	if err != nil {
		return fmt.Errorf("db: delete user — dm conversations: %w", err)
	}

	// Step 2: delete the user row; FK cascades handle everything else.
	_, err = tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		return fmt.Errorf("db: delete user — users row: %w", err)
	}

	return tx.Commit(ctx)
}

// ══════════════════════════════════════════════════════════════
// PQXDH PRE-KEY BUNDLE OPERATIONS
// ══════════════════════════════════════════════════════════════

// RegisterDevice creates a new device entry for the user and returns its ID.
// Called during login or when a new browser/app instance is first used.
func (s *Store) RegisterDevice(ctx context.Context, userID uuid.UUID, label string) (uuid.UUID, error) {
	var deviceID uuid.UUID
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO user_devices (user_id, device_label)
		VALUES ($1, $2)
		RETURNING id
	`, userID, label).Scan(&deviceID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("db: register device: %w", err)
	}
	return deviceID, nil
}

// UpsertPreKeyBundle saves or replaces the signed pre-key for a device.
// identityKey and spk are base64-encoded X25519 public keys.
// spkSignature is the EdDSA signature of the SPK by the identity key.
func (s *Store) UpsertPreKeyBundle(ctx context.Context, deviceID uuid.UUID, identityKey, spk string, spkID int, spkSignature string) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO user_prekeys (device_id, identity_key, spk, spk_id, spk_signature, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (device_id) DO UPDATE
		  SET identity_key  = EXCLUDED.identity_key,
		      spk           = EXCLUDED.spk,
		      spk_id        = EXCLUDED.spk_id,
		      spk_signature = EXCLUDED.spk_signature,
		      updated_at    = NOW()
	`, deviceID, identityKey, spk, spkID, spkSignature)
	if err != nil {
		return fmt.Errorf("db: upsert prekey bundle: %w", err)
	}
	return nil
}

// InsertOneTimeKeys bulk-inserts a batch of X25519 one-time pre-keys for a device.
// keys is a slice of (key_id, public_key) pairs.
func (s *Store) InsertOneTimeKeys(ctx context.Context, deviceID uuid.UUID, keys []models.OneTimeKey) error {
	for _, k := range keys {
		_, err := s.Pool.Exec(ctx, `
			INSERT INTO user_otkeys (device_id, key_id, public_key)
			VALUES ($1, $2, $3)
			ON CONFLICT DO NOTHING
		`, deviceID, k.KeyID, k.PublicKey)
		if err != nil {
			return fmt.Errorf("db: insert otkey: %w", err)
		}
	}
	return nil
}

// InsertPQKeys bulk-inserts a batch of ML-KEM-768 post-quantum one-time keys.
func (s *Store) InsertPQKeys(ctx context.Context, deviceID uuid.UUID, keys []models.OneTimeKey) error {
	for _, k := range keys {
		_, err := s.Pool.Exec(ctx, `
			INSERT INTO user_pqkeys (device_id, key_id, public_key)
			VALUES ($1, $2, $3)
			ON CONFLICT DO NOTHING
		`, deviceID, k.KeyID, k.PublicKey)
		if err != nil {
			return fmt.Errorf("db: insert pqkey: %w", err)
		}
	}
	return nil
}

// GetPreKeyBundle fetches the key bundle for a user's device.
// It atomically claims (deletes) one OTK and one PQK from their pools,
// returning them for use in a single PQXDH handshake. If no OTK/PQK
// is available, those fields will be empty — the sender must fall back
// to the SPK alone (still secure, just without one-time forward secrecy).
func (s *Store) GetPreKeyBundle(ctx context.Context, recipientUserID uuid.UUID) (*models.PreKeyBundle, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("db: get prekey bundle begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Fetch the latest device + signed pre-key for the recipient
	var bundle models.PreKeyBundle
	err = tx.QueryRow(ctx, `
		SELECT d.id, pk.identity_key, pk.spk, pk.spk_id, pk.spk_signature
		FROM user_devices d
		JOIN user_prekeys pk ON pk.device_id = d.id
		WHERE d.user_id = $1
		ORDER BY pk.updated_at DESC
		LIMIT 1
	`, recipientUserID).Scan(
		&bundle.DeviceID,
		&bundle.IdentityKey,
		&bundle.SignedPreKey,
		&bundle.SignedPreKeyID,
		&bundle.SignedPreKeySignature,
	)
	if err != nil {
		return nil, fmt.Errorf("db: no prekey bundle found for user: %w", err)
	}

	// Claim (consume) one OTK atomically — DELETE and return
	var otkID int
	var otkKey string
	err = tx.QueryRow(ctx, `
		DELETE FROM user_otkeys
		WHERE id = (
			SELECT id FROM user_otkeys
			WHERE device_id = $1
			ORDER BY created_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING key_id, public_key
	`, bundle.DeviceID).Scan(&otkID, &otkKey)
	if err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("db: claim otkey: %w", err)
	}
	bundle.OneTimeKeyID = otkID
	bundle.OneTimeKey = otkKey

	// Claim (consume) one PQK atomically — DELETE and return
	var pqkID int
	var pqkKey string
	err = tx.QueryRow(ctx, `
		DELETE FROM user_pqkeys
		WHERE id = (
			SELECT id FROM user_pqkeys
			WHERE device_id = $1
			ORDER BY created_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING key_id, public_key
	`, bundle.DeviceID).Scan(&pqkID, &pqkKey)
	if err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("db: claim pqkey: %w", err)
	}
	bundle.PQKeyID = pqkID
	bundle.PQKey = pqkKey

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("db: get prekey bundle commit: %w", err)
	}
	return &bundle, nil
}

// ══════════════════════════════════════════════════════════════
// MASTER HISTORY KEY (MHK) HISTORY OPERATIONS
// ══════════════════════════════════════════════════════════════

// PushMHKHistoryEntry upserts one encrypted history entry for a user.
// The ciphertext (ct) is opaque to the server — only the owning user's
// device can decrypt it using their locally-derived Master History Key.
func (s *Store) PushMHKHistoryEntry(ctx context.Context, ownerID, conversationID, messageID uuid.UUID, iv, ct string, sentAt time.Time) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO mhk_history (owner_id, conversation_id, message_id, iv, ct, sent_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (owner_id, message_id) DO NOTHING
	`, ownerID, conversationID, messageID, iv, ct, sentAt)
	if err != nil {
		return fmt.Errorf("db: push mhk history: %w", err)
	}
	return nil
}

// GetMHKHistory retrieves paginated encrypted history entries for a user's
// conversation, ordered newest-first. The cursor is a sent_at timestamp.
// Clients decrypt on-the-fly as they receive entries.
func (s *Store) GetMHKHistory(ctx context.Context, ownerID, conversationID uuid.UUID, cursor time.Time, limit int) ([]models.MHKHistoryEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT message_id, iv, ct, sent_at
		FROM mhk_history
		WHERE owner_id = $1
		  AND conversation_id = $2
		  AND sent_at < $3
		ORDER BY sent_at DESC
		LIMIT $4
	`, ownerID, conversationID, cursor, limit)
	if err != nil {
		return nil, fmt.Errorf("db: get mhk history: %w", err)
	}
	defer rows.Close()

	var entries []models.MHKHistoryEntry
	for rows.Next() {
		var e models.MHKHistoryEntry
		if err := rows.Scan(&e.MessageID, &e.IV, &e.CT, &e.SentAt); err != nil {
			return nil, fmt.Errorf("db: scan mhk history entry: %w", err)
		}
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []models.MHKHistoryEntry{}
	}
	return entries, rows.Err()
}

// SaveRecoveryBlob stores the mnemonic-encrypted MHK recovery blob for a user.
func (s *Store) SaveRecoveryBlob(ctx context.Context, userID uuid.UUID, blob string) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO user_recovery_blobs (user_id, blob, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (user_id) DO UPDATE
		  SET blob = EXCLUDED.blob,
		      updated_at = NOW()
	`, userID, blob)
	if err != nil {
		return fmt.Errorf("db: save recovery blob: %w", err)
	}
	return nil
}

// GetRecoveryBlob retrieves the mnemonic-encrypted MHK recovery blob.
func (s *Store) GetRecoveryBlob(ctx context.Context, userID uuid.UUID) (string, error) {
	var blob string
	err := s.Pool.QueryRow(ctx, `
		SELECT COALESCE(blob, '')
		FROM user_recovery_blobs
		WHERE user_id = $1
	`, userID).Scan(&blob)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("db: get recovery blob: %w", err)
	}
	return blob, nil
}
