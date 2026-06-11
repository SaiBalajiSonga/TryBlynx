// ═══════════════════════════════════════════════════════════════
// File:         internal/matchmaker/worker.go
// Purpose:      Batch matchmaking worker with time-based filter
//               relaxation
// Dependencies: github.com/redis/go-redis/v9, github.com/google/uuid,
//               internal/ws (Hub.SendToUser), internal/db
// Role:         Implements the Active Worker Matchmaking pattern:
//               a persistent goroutine that wakes every tick interval,
//               fetches all tickets from the Redis waiting pool,
//               separates them into normal and shadowban pools, and
//               attempts to pair compatible users.
//
//               Filter Relaxation (time-based):
//               As a user waits longer, filters are progressively
//               dropped to increase match probability:
//                 0-10s:  All filters active (interests, location, language)
//                 10-20s: Interests filter dropped
//                 20-30s: Location filter dropped
//                 30s+:   Language filter dropped (only gender remains)
//
//               Gender is ALWAYS a strict filter but requires is_vip
//               to select a specific target gender. Non-VIP users
//               match with any gender.
//
//               Shadowban isolation: shadowbanned users ONLY match
//               with other shadowbanned users. They experience the
//               same UI flow but are quarantined into a separate pool.
// ═══════════════════════════════════════════════════════════════

package matchmaker

import (
	"context"
	"encoding/json"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"tryblynx/internal/db"
)

// ──────────────────────────────────────────────────────────────
// Configuration Defaults
// ──────────────────────────────────────────────────────────────

const (
	// defaultTickInterval is how often the worker processes the
	// waiting pool. 500ms provides near-instant matching while
	// keeping CPU usage minimal.
	defaultTickInterval = 500 * time.Millisecond

	// Filter relaxation thresholds (configurable via WorkerConfig).
	defaultDropInterestsAfter = 10 * time.Second
	defaultDropLocationAfter  = 20 * time.Second
	defaultDropLanguageAfter  = 30 * time.Second
)

// ──────────────────────────────────────────────────────────────
// WorkerConfig
// ──────────────────────────────────────────────────────────────

// WorkerConfig holds tunable parameters for the matchmaker worker.
// All durations default to sensible values if left at zero.
type WorkerConfig struct {
	// TickInterval is how often the worker processes the queue.
	// Default: 500ms.
	TickInterval time.Duration

	// DropInterestsAfter is the wait duration after which the
	// interests filter is relaxed. Default: 10s.
	DropInterestsAfter time.Duration

	// DropLocationAfter is the wait duration after which the
	// location filter is relaxed. Default: 20s.
	DropLocationAfter time.Duration

	// DropLanguageAfter is the wait duration after which the
	// language filter is relaxed. Default: 30s.
	DropLanguageAfter time.Duration
}

// withDefaults returns a copy of the config with zero values
// replaced by defaults.
func (c WorkerConfig) withDefaults() WorkerConfig {
	if c.TickInterval == 0 {
		c.TickInterval = defaultTickInterval
	}
	if c.DropInterestsAfter == 0 {
		c.DropInterestsAfter = defaultDropInterestsAfter
	}
	if c.DropLocationAfter == 0 {
		c.DropLocationAfter = defaultDropLocationAfter
	}
	if c.DropLanguageAfter == 0 {
		c.DropLanguageAfter = defaultDropLanguageAfter
	}
	return c
}

// ──────────────────────────────────────────────────────────────
// MatchNotifier
// ──────────────────────────────────────────────────────────────

// MatchNotifier is the interface the worker uses to notify matched
// users. In production, this is implemented by ws.Hub.SendToUser.
// The interface decouples the matchmaker from the WebSocket package
// for testability.
type MatchNotifier interface {
	SendToUser(userID uuid.UUID, data []byte)
}

// ──────────────────────────────────────────────────────────────
// Worker
// ──────────────────────────────────────────────────────────────

// Worker is the batch matchmaking engine that runs as a persistent
// goroutine. It processes the Redis waiting pool at regular
// intervals and pairs compatible users.
type Worker struct {
	rdb      *redis.Client
	store    *db.Store
	notifier MatchNotifier
	config   WorkerConfig

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewWorker creates a new matchmaker worker with the provided
// dependencies.
//
// Parameters:
//   - rdb:      Redis client for reading/writing the waiting pool.
//   - store:    Database store for creating match conversations.
//   - notifier: Callback interface to notify matched users (Hub).
//   - cfg:      Worker configuration (tick interval, relaxation thresholds).
//
// Returns:
//   - *Worker: Ready to start via worker.Start().
func NewWorker(rdb *redis.Client, store *db.Store, notifier MatchNotifier, cfg WorkerConfig) *Worker {
	ctx, cancel := context.WithCancel(context.Background())
	return &Worker{
		rdb:      rdb,
		store:    store,
		notifier: notifier,
		config:   cfg.withDefaults(),
		ctx:      ctx,
		cancel:   cancel,
	}
}

// Start launches the worker in a background goroutine. Call
// Stop() to shut it down gracefully.
func (w *Worker) Start() {
	w.wg.Add(1)
	go w.run()
	log.Printf("matchmaker: worker started (tick=%v, relax: interests=%v, location=%v, language=%v)",
		w.config.TickInterval, w.config.DropInterestsAfter,
		w.config.DropLocationAfter, w.config.DropLanguageAfter)
}

// Stop gracefully shuts down the worker and waits for the
// goroutine to exit.
func (w *Worker) Stop() {
	w.cancel()
	w.wg.Wait()
	log.Println("matchmaker: worker stopped")
}

// ──────────────────────────────────────────────────────────────
// Main Loop
// ──────────────────────────────────────────────────────────────

// run is the worker's main loop. It ticks at the configured
// interval and processes the waiting pool on each tick.
func (w *Worker) run() {
	defer w.wg.Done()
	ticker := time.NewTicker(w.config.TickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-w.ctx.Done():
			return
		case <-ticker.C:
			w.processTick()
		}
	}
}

// processTick performs one iteration of the matchmaking algorithm:
// 1. Fetch all tickets from Redis
// 2. Separate into normal and shadowbanned pools
// 3. Run matching on each pool independently
func (w *Worker) processTick() {
	tickets, err := FetchAllTickets(w.ctx, w.rdb)
	if err != nil {
		log.Printf("matchmaker: failed to fetch tickets: %v", err)
		return
	}

	if len(tickets) < 2 {
		return // Need at least 2 tickets to make a match
	}

	// ── Shadowban isolation: separate pools ──────────────────
	normalPool, shadowPool := SeparatePools(tickets)

	// ── Process each pool independently ──────────────────────
	w.matchPool(normalPool)
	w.matchPool(shadowPool)
}

// matchPool attempts to pair compatible users within a single pool.
// Tickets are sorted oldest-first (highest priority) and matched
// greedily: for each unmatched ticket A, find the first compatible
// unmatched ticket B.
func (w *Worker) matchPool(pool []*MatchTicket) {
	if len(pool) < 2 {
		return
	}

	// Sort by SubmittedAt ascending (oldest first = highest priority)
	sort.Slice(pool, func(i, j int) bool {
		return pool[i].SubmittedAt.Before(pool[j].SubmittedAt)
	})

	now := time.Now()
	matched := make(map[uuid.UUID]bool)

	for i := 0; i < len(pool); i++ {
		a := pool[i]
		if matched[a.UserID] {
			continue
		}

		waitA := now.Sub(a.SubmittedAt)

		for j := i + 1; j < len(pool); j++ {
			b := pool[j]
			if matched[b.UserID] {
				continue
			}

			waitB := now.Sub(b.SubmittedAt)

			if isCompatible(a, b, waitA, waitB, w.config) {
				// ── Match found! ─────────────────────────────
				matched[a.UserID] = true
				matched[b.UserID] = true
				w.finalizeMatch(a, b)
				break
			}
		}
	}
}

// ──────────────────────────────────────────────────────────────
// Compatibility Engine
// ──────────────────────────────────────────────────────────────

// isCompatible determines whether two tickets can be matched,
// applying time-based filter relaxation.
//
// Filter evaluation order (matches the spec):
//  1. Gender (STRICT — never relaxed, VIP-only to select target)
//  2. Interests (dropped after DropInterestsAfter)
//  3. Location (dropped after DropLocationAfter)
//  4. Language (dropped after DropLanguageAfter)
//
// The maxWait of the two users is used for relaxation so that
// a long-waiting user isn't blocked by a freshly-queued one.
//
// Parameters:
//   - a, b:          The two candidate tickets.
//   - waitA, waitB:  How long each user has been waiting.
//   - cfg:           Worker configuration with relaxation thresholds.
//
// Returns:
//   - bool: True if the two users are compatible for matching.
func isCompatible(a, b *MatchTicket, waitA, waitB time.Duration, cfg WorkerConfig) bool {
	maxWait := waitA
	if waitB > maxWait {
		maxWait = waitB
	}

	// ── 1. STRICT: Gender filter (VIP-only feature) ──────────
	// A VIP user who specified a target gender will only match
	// with users of that gender. Non-VIP users always have
	// target_gender="any" (enforced at ticket submission).
	if a.IsVIP && a.TargetGender != "any" && b.Gender != a.TargetGender {
		return false
	}
	if b.IsVIP && b.TargetGender != "any" && a.Gender != b.TargetGender {
		return false
	}

	// ── 2. RELAXABLE: Interests (drop after threshold) ───────
	if maxWait < cfg.DropInterestsAfter {
		if !hasOverlap(a.Interests, b.Interests) {
			return false
		}
	}

	// ── 3. RELAXABLE: Location (drop after threshold) ────────
	if maxWait < cfg.DropLocationAfter {
		if a.Location != "" && b.Location != "" && a.Location != b.Location {
			return false
		}
	}

	// ── 4. RELAXABLE: Language (drop after threshold) ────────
	if maxWait < cfg.DropLanguageAfter {
		if a.Language != "" && b.Language != "" && a.Language != b.Language {
			return false
		}
	}

	return true
}

// hasOverlap returns true if the two slices share at least one
// common element. Returns true if either slice is empty (no
// filter applied).
func hasOverlap(a, b []string) bool {
	if len(a) == 0 || len(b) == 0 {
		return true // No interests = match anyone
	}

	set := make(map[string]bool, len(a))
	for _, v := range a {
		set[v] = true
	}
	for _, v := range b {
		if set[v] {
			return true
		}
	}
	return false
}

// ──────────────────────────────────────────────────────────────
// Match Finalization
// ──────────────────────────────────────────────────────────────

// finalizeMatch handles the post-match workflow:
// 1. Remove both tickets from Redis
// 2. Create a "random" conversation in PostgreSQL
// 3. Notify both users via WebSocket
func (w *Worker) finalizeMatch(a, b *MatchTicket) {
	ctx := context.Background()

	// 1. Remove tickets atomically
	pipe := w.rdb.Pipeline()
	pipe.ZRem(ctx, "waiting_pool", a.UserID.String())
	pipe.ZRem(ctx, "waiting_pool", b.UserID.String())
	pipe.Del(ctx, "ticket:"+a.UserID.String())
	pipe.Del(ctx, "ticket:"+b.UserID.String())
	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("matchmaker: failed to remove tickets for %s and %s: %v",
			a.UserID, b.UserID, err)
	}

	// 2. Generate an ephemeral Room ID for the frontend UI grouping
	roomID := uuid.New()

	// 3. Notify both users
	notification := matchFoundMessage{
		Type: "match.found",
		Payload: matchFoundPayload{
			RoomID: roomID.String(),
			PeerID: "", // Set per-user below
		},
	}

	// Notify user A (peer = B)
	notification.Payload.PeerID = b.UserID.String()
	dataA, _ := json.Marshal(notification)
	w.notifier.SendToUser(a.UserID, dataA)

	// Notify user B (peer = A)
	notification.Payload.PeerID = a.UserID.String()
	dataB, _ := json.Marshal(notification)
	w.notifier.SendToUser(b.UserID, dataB)

	log.Printf("matchmaker: ✓ matched %s ↔ %s (ephemeral room: %s)", a.UserID, b.UserID, roomID)
}

// ──────────────────────────────────────────────────────────────
// Notification Types
// ──────────────────────────────────────────────────────────────

type matchFoundMessage struct {
	Type    string            `json:"type"`
	Payload matchFoundPayload `json:"payload"`
}

type matchFoundPayload struct {
	RoomID string `json:"room_id"`
	PeerID string `json:"peer_id"`
}
