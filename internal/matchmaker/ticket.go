// ═══════════════════════════════════════════════════════════════
// File:         internal/matchmaker/ticket.go
// Purpose:      MatchTicket data structure and Redis ZSET/HASH
//               operations for the matchmaking queue
// Dependencies: github.com/redis/go-redis/v9, github.com/google/uuid
// Role:         Defines the MatchTicket struct that represents a
//               user waiting to be matched, and provides functions
//               to read tickets from Redis. Tickets are stored as:
//               - ZSET "waiting_pool": score=UnixMilli, member=userID
//               - HASH "ticket:{userID}": all matchmaking attributes
//
//               The WS handlers (Stream C) write tickets via Redis
//               pipeline. This package provides the read path used
//               by the batch worker (worker.go) to fetch and parse
//               all active tickets.
// ═══════════════════════════════════════════════════════════════

package matchmaker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// ──────────────────────────────────────────────────────────────
// MatchTicket
// ──────────────────────────────────────────────────────────────

// MatchTicket represents a user waiting in the matchmaking queue.
// All fields are populated from the Redis HASH "ticket:{userID}".
//
// Fields:
//   - UserID:       The queued user's UUID.
//   - Gender:       The user's own gender (male/female/other/unspecified).
//   - TargetGender: Desired match gender ("any" for non-VIP users).
//   - Location:     ISO 3166 country code or city.
//   - Language:     BCP-47 language tag.
//   - Interests:    Array of interest tags for compatibility scoring.
//   - IsVIP:        Whether the user has premium status.
//   - Shadowbanned: Whether the user is quarantined.
//   - SubmittedAt:  Timestamp when the ticket was submitted (for
//                   filter relaxation timing).
type MatchTicket struct {
	UserID       uuid.UUID
	Gender       string
	TargetGender string
	Location     string
	Language     string
	Interests    []string
	IsVIP        bool
	Shadowbanned bool
	SubmittedAt  time.Time
}

// ──────────────────────────────────────────────────────────────
// Redis Operations
// ──────────────────────────────────────────────────────────────

// FetchAllTickets retrieves all tickets from the Redis waiting
// pool. It reads the ZSET to get all user IDs, then fetches
// each ticket's attributes from its HASH.
//
// Parameters:
//   - ctx: Context for cancellation/timeout.
//   - rdb: Redis client.
//
// Returns:
//   - []*MatchTicket: All active tickets, ordered by submission time.
//   - error:          Non-nil on Redis communication failure.
//
// Performance: Uses a Redis pipeline to batch-fetch all ticket
// hashes in a single round-trip, avoiding N+1 query patterns.
func FetchAllTickets(ctx context.Context, rdb *redis.Client) ([]*MatchTicket, error) {
	// 1. Get all user IDs from the sorted set
	members, err := rdb.ZRangeByScore(ctx, "waiting_pool", &redis.ZRangeBy{
		Min: "-inf",
		Max: "+inf",
	}).Result()
	if err != nil {
		return nil, fmt.Errorf("matchmaker: failed to read waiting_pool: %w", err)
	}

	if len(members) == 0 {
		return nil, nil
	}

	// 2. Pipeline: fetch all ticket hashes in one round-trip
	pipe := rdb.Pipeline()
	cmds := make([]*redis.MapStringStringCmd, len(members))
	for i, userIDStr := range members {
		cmds[i] = pipe.HGetAll(ctx, "ticket:"+userIDStr)
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, fmt.Errorf("matchmaker: failed to fetch ticket hashes: %w", err)
	}

	// 3. Parse each ticket
	tickets := make([]*MatchTicket, 0, len(members))
	for i, cmd := range cmds {
		data, err := cmd.Result()
		if err != nil || len(data) == 0 {
			// Ticket hash missing (possibly expired/cancelled) — skip
			continue
		}

		ticket, err := parseTicket(members[i], data)
		if err != nil {
			// Malformed ticket — remove from pool and skip
			rdb.ZRem(ctx, "waiting_pool", members[i])
			rdb.Del(ctx, "ticket:"+members[i])
			continue
		}

		tickets = append(tickets, ticket)
	}

	return tickets, nil
}

// RemoveTicket removes a user's ticket from both the ZSET and
// the HASH atomically via a pipeline.
//
// Parameters:
//   - ctx:    Context for cancellation.
//   - rdb:    Redis client.
//   - userID: The user whose ticket should be removed.
//
// Returns:
//   - error: Non-nil on Redis communication failure.
func RemoveTicket(ctx context.Context, rdb *redis.Client, userID uuid.UUID) error {
	pipe := rdb.Pipeline()
	pipe.ZRem(ctx, "waiting_pool", userID.String())
	pipe.Del(ctx, "ticket:"+userID.String())
	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("matchmaker: failed to remove ticket for %s: %w", userID, err)
	}
	return nil
}

// ──────────────────────────────────────────────────────────────
// Internal Helpers
// ──────────────────────────────────────────────────────────────

// parseTicket converts a Redis HASH map into a MatchTicket struct.
func parseTicket(userIDStr string, data map[string]string) (*MatchTicket, error) {
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %s", userIDStr)
	}

	submittedAt, err := time.Parse(time.RFC3339Nano, data["submitted_at"])
	if err != nil {
		return nil, fmt.Errorf("invalid submitted_at for %s", userIDStr)
	}

	var interests []string
	if raw := data["interests"]; raw != "" {
		json.Unmarshal([]byte(raw), &interests)
	}
	if interests == nil {
		interests = []string{}
	}

	return &MatchTicket{
		UserID:       userID,
		Gender:       data["gender"],
		TargetGender: data["target_gender"],
		Location:     data["location"],
		Language:     data["language"],
		Interests:    interests,
		IsVIP:        data["is_vip"] == "true",
		Shadowbanned: data["shadowbanned"] == "true",
		SubmittedAt:  submittedAt,
	}, nil
}
