// ═══════════════════════════════════════════════════════════════
// File:         internal/config/config.go
// Purpose:      Centralized environment configuration loader
// Dependencies: Standard library only (os, fmt, strconv)
// Role:         Single source of truth for application settings.
//               Loads all configuration from environment variables,
//               applies sensible defaults, and validates that all
//               required values are present before the server starts.
//               Consumed by every other package via dependency injection.
// ═══════════════════════════════════════════════════════════════

package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all application configuration values organized by
// subsystem. Required fields are validated in Load(); optional
// fields carry defaults.
type Config struct {
	// ── Database ─────────────────────────────────────────────
	// DatabaseURL is the full PostgreSQL DSN.
	// Required. Example: postgres://user:pass@host:5432/dbname?sslmode=disable
	DatabaseURL string

	// DBMaxConns is the maximum number of connections in the pgxpool.
	// Default: 100. These are shared across all 10K-20K WebSocket connections.
	DBMaxConns int32

	// DBMinConns is the minimum idle connections kept warm in the pool.
	// Default: 10.
	DBMinConns int32

	// ── Redis ────────────────────────────────────────────────
	// RedisURL is the Redis connection string.
	// Default: redis://localhost:6379/0
	RedisURL string

	// ── JWT ──────────────────────────────────────────────────
	// JWTSecret is the HMAC-SHA256 signing key for JWT tokens.
	// Required. Must be a high-entropy string (>= 32 bytes recommended).
	JWTSecret string

	// JWTExpiryHours is the token lifetime in hours.
	// Default: 24.
	JWTExpiryHours int

	// ── Stripe ───────────────────────────────────────────────
	// StripeSecretKey is the Stripe API secret key (sk_test_... or sk_live_...).
	StripeSecretKey string

	// StripeWebhookSecret is the signing secret for verifying webhook payloads.
	StripeWebhookSecret string

	// ── Coturn ───────────────────────────────────────────────
	// CoturnSecret is the static auth secret shared with the TURN server.
	CoturnSecret string

	// ── Server ───────────────────────────────────────────────
	// ServerPort is the HTTP listen port.
	// Default: 8080.
	ServerPort string
}

// Load reads configuration from environment variables, applies
// defaults for optional values, and validates that all required
// values are present.
//
// Returns:
//   - *Config: A fully populated configuration struct.
//   - error:   Non-nil if a required variable is missing or a
//     numeric variable cannot be parsed.
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:         getEnv("DATABASE_URL", ""),
		RedisURL:            getEnv("REDIS_URL", "redis://localhost:6379/0"),
		JWTSecret:           getEnv("JWT_SECRET", ""),
		JWTExpiryHours:      getEnvInt("JWT_EXPIRY_HOURS", 24),
		StripeSecretKey:     getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret: getEnv("STRIPE_WEBHOOK_SECRET", ""),
		CoturnSecret:        getEnv("COTURN_SECRET", ""),
		ServerPort:          getEnv("SERVER_PORT", "8080"),
		DBMaxConns:          int32(getEnvInt("DB_MAX_CONNS", 100)),
		DBMinConns:          int32(getEnvInt("DB_MIN_CONNS", 10)),
	}

	// ── Validate required fields ─────────────────────────────
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("config: JWT_SECRET is required")
	}
	if len(cfg.JWTSecret) < 16 {
		return nil, fmt.Errorf("config: JWT_SECRET must be at least 16 characters")
	}

	return cfg, nil
}

// getEnv returns the value of an environment variable, or the
// provided fallback if the variable is not set or empty.
func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// getEnvInt returns the integer value of an environment variable,
// or the provided fallback if the variable is not set, empty, or
// cannot be parsed as an integer.
func getEnvInt(key string, fallback int) int {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return fallback
	}
	return n
}
