// ═══════════════════════════════════════════════════════════════
// File:         internal/redisclient/client.go
// Purpose:      Redis client factory with connection pool tuning
// Dependencies: github.com/redis/go-redis/v9
// Role:         Provides a single factory function for creating a
//               go-redis client configured for 10K-20K concurrent
//               WebSocket connections. Used by main.go at startup
//               and injected into the Hub and Matchmaker.
//               The pool is shared across Pub/Sub, ZADD/ZREM
//               (matchmaker), HSET/HGETALL (tickets), and SET/GET
//               (presence). Pub/Sub uses a dedicated connection
//               outside the pool.
// ═══════════════════════════════════════════════════════════════

package redisclient

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// NewClient creates a new Redis client from a connection URL and
// verifies connectivity with a PING.
//
// Parameters:
//   - redisURL: A Redis connection string (e.g., "redis://localhost:6379/0").
//
// Returns:
//   - *redis.Client: A pooled, health-checked Redis client.
//   - error:         Non-nil if the URL is malformed or the PING fails.
//
// Pool tuning:
//   - PoolSize:     100 connections (shared across all goroutines)
//   - MinIdleConns: 10  (pre-warmed for low-latency first requests)
//   - DialTimeout:  5s
//   - ReadTimeout:  3s
//   - WriteTimeout: 3s
func NewClient(redisURL string) (*redis.Client, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("redis: failed to parse URL: %w", err)
	}

	// ── Pool tuning for high-concurrency workload ────────────
	opt.PoolSize = 100
	opt.MinIdleConns = 10
	opt.DialTimeout = 5 * time.Second
	opt.ReadTimeout = 3 * time.Second
	opt.WriteTimeout = 3 * time.Second

	client := redis.NewClient(opt)

	// Verify connectivity
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis: failed to connect: %w", err)
	}

	return client, nil
}
