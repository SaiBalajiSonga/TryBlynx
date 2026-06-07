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
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"tryblynx/internal/models"
)

// Store wraps a PostgreSQL connection pool and provides typed
// query methods for all database operations. It is the single
// entry point for data access throughout the application.
type Store struct {
	Pool *pgxpool.Pool
}

// NewStore creates a new Store backed by the provided connection pool.
//
// Parameters:
//   - pool: An initialized pgxpool.Pool (created via db.NewPool).
//
// Returns:
//   - *Store: Ready for concurrent use across goroutines.
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{Pool: pool}
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
	is_vip, shadowbanned,
	created_at, updated_at`

// scanUser scans a single row matching the userColumns layout
// into a models.User struct. Guarantees Interests is never nil.
func scanUser(row pgx.Row) (*models.User, error) {
	var u models.User
	err := row.Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash,
		&u.DisplayName, &u.AvatarURL, &u.Bio,
		&u.Gender, &u.Location, &u.Language, &u.Interests,
		&u.IsVIP, &u.Shadowbanned,
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
//   - username:     Unique username (3-32 characters).
//   - email:        Unique email address (lowercased by caller).
//   - passwordHash: bcrypt hash of the user's password.
//
// Returns:
//   - *models.User: The newly created user with all default values populated.
//   - error:        Non-nil on duplicate key violation or connection failure.
func (s *Store) CreateUser(ctx context.Context, username, email, passwordHash string) (*models.User, error) {
	row := s.Pool.QueryRow(ctx, `
		INSERT INTO users (username, email, password_hash)
		VALUES ($1, $2, $3)
		RETURNING `+userColumns,
		username, email, passwordHash,
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
//
// Returns:
//   - *models.User: The updated user with all fields.
//   - error:        Non-nil on validation failure or connection error.
func (s *Store) UpdateUserProfile(
	ctx context.Context, id uuid.UUID,
	displayName, avatarURL, bio, gender, location, language string,
	interests []string,
) (*models.User, error) {
	row := s.Pool.QueryRow(ctx, `
		UPDATE users SET
			display_name = $2, avatar_url = $3, bio = $4,
			gender = $5, location = $6, language = $7, interests = $8
		WHERE id = $1
		RETURNING `+userColumns,
		id, displayName, avatarURL, bio, gender, location, language, interests,
	)
	return scanUser(row)
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
func (s *Store) CreateMessage(ctx context.Context, conversationID, senderID uuid.UUID, body string) (*models.Message, error) {
	var m models.Message
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO messages (conversation_id, sender_id, body)
		VALUES ($1, $2, $3)
		RETURNING id, conversation_id, sender_id, body, created_at`,
		conversationID, senderID, body,
	).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("db: failed to create message: %w", err)
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
func (s *Store) GetMessages(ctx context.Context, conversationID uuid.UUID, cursor time.Time, limit int) ([]models.Message, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	rows, err := s.Pool.Query(ctx, `
		SELECT id, conversation_id, sender_id, body, created_at
		FROM messages
		WHERE conversation_id = $1 AND created_at < $2
		ORDER BY created_at DESC
		LIMIT $3`,
		conversationID, cursor, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("db: failed to query messages: %w", err)
	}
	defer rows.Close()

	var msgs []models.Message
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Body, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("db: failed to scan message: %w", err)
		}
		msgs = append(msgs, m)
	}

	if msgs == nil {
		msgs = []models.Message{}
	}
	return msgs, rows.Err()
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
			) AS last_message_at
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
			&cs.LastMessage, &cs.LastMessageAt,
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
