// ═══════════════════════════════════════════════════════════════
// File:         internal/db/pool.go
// Purpose:      PostgreSQL connection pool initialization
// Dependencies: github.com/jackc/pgx/v5/pgxpool, internal/config
// Role:         Creates and configures a bounded pgxpool.Pool
//               tuned for high-concurrency WebSocket workloads.
//               At 10K-20K concurrent WebSocket connections, the
//               Go application shares a pool of ~100 database
//               connections — each WS connection does NOT hold a
//               PG connection open. This is the critical design
//               decision that avoids Supabase's 200-conn ceiling.
// ═══════════════════════════════════════════════════════════════

package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"lynxus/internal/config"
)

// NewPool creates a new PostgreSQL connection pool configured
// with the provided application settings.
//
// Parameters:
//   - ctx: Context for the initial connection and health check.
//   - cfg: Application configuration containing DATABASE_URL,
//     DB_MAX_CONNS, and DB_MIN_CONNS.
//
// Returns:
//   - *pgxpool.Pool: A configured, health-checked pool ready
//     for concurrent use across all goroutines.
//   - error: Non-nil if the DSN is invalid, the connection fails,
//     or the health check ping times out.
//
// Pool tuning:
//   - MaxConns:          cfg.DBMaxConns (default 100)
//   - MinConns:          cfg.DBMinConns (default 10, pre-warmed)
//   - MaxConnLifetime:   1 hour   (recycles long-lived connections)
//   - MaxConnIdleTime:   15 min   (returns idle connections to OS)
//   - HealthCheckPeriod: 30 sec   (detects broken connections early)
func NewPool(ctx context.Context, cfg *config.Config) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: failed to parse DATABASE_URL: %w", err)
	}

	// ── Connection pool bounds ───────────────────────────────
	poolCfg.MaxConns = cfg.DBMaxConns
	poolCfg.MinConns = cfg.DBMinConns

	// ── Connection lifecycle ─────────────────────────────────
	poolCfg.MaxConnLifetime = 1 * time.Hour
	poolCfg.MaxConnIdleTime = 15 * time.Minute
	poolCfg.HealthCheckPeriod = 30 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("db: failed to create connection pool: %w", err)
	}

	// Verify connectivity before returning the pool
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db: failed to ping database: %w", err)
	}

	return pool, nil
}
