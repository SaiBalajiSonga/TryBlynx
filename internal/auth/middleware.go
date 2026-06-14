// ═══════════════════════════════════════════════════════════════
// File:         internal/auth/middleware.go
// Purpose:      HTTP authentication middleware and context helpers
// Dependencies: internal/auth (jwt.go), github.com/google/uuid
// Role:         Extracts and validates JWT from the Authorization
//               header on protected HTTP routes. Injects the
//               authenticated user's identity (UserID, IsVIP,
//               Shadowbanned) into the request context. Provides
//               type-safe context accessor functions used by all
//               API handlers.
//
//               Note: The WebSocket upgrade endpoint uses its own
//               JWT extraction (from query params) in ws/upgrader.go
//               and does not pass through this middleware.
// ═══════════════════════════════════════════════════════════════

package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

// contextKey is an unexported type used for context value keys to
// prevent collisions with keys from other packages.
type contextKey string

const (
	// ContextKeyUserID stores the authenticated user's UUID.
	ContextKeyUserID contextKey = "userID"
	// ContextKeyIsVIP stores the user's VIP subscription status.
	ContextKeyIsVIP contextKey = "isVIP"
	// ContextKeyShadowbanned stores the user's shadowban status.
	ContextKeyShadowbanned contextKey = "shadowbanned"
	// ContextKeyIsAnonymous stores whether this is a guest account.
	ContextKeyIsAnonymous contextKey = "isAnonymous"
)

// Middleware returns an HTTP middleware that extracts and validates
// a JWT from the Authorization header (Bearer scheme).
//
// Parameters:
//   - jwtSecret: The HMAC-SHA256 signing key for token validation.
//
// Behavior:
//   - Reads the "Authorization: Bearer <token>" header.
//   - Validates the token via auth.ValidateToken.
//   - On success: injects UserID, IsVIP, Shadowbanned into context
//     and calls next.ServeHTTP.
//   - On failure: responds with 401 Unauthorized JSON error.
//
// Returns:
//   - func(http.Handler) http.Handler: A chi-compatible middleware.
func Middleware(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// ── Extract token from header ────────────────────
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				w.Header().Set("Content-Type", "application/json")
				http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenStr == authHeader {
				// Header present but not in "Bearer <token>" format
				w.Header().Set("Content-Type", "application/json")
				http.Error(w, `{"error":"invalid authorization format, expected: Bearer <token>"}`, http.StatusUnauthorized)
				return
			}

			// ── Validate token ───────────────────────────────
			claims, err := ValidateToken(jwtSecret, tokenStr)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
				return
			}

			// ── Inject claims into context ───────────────────
			ctx := context.WithValue(r.Context(), ContextKeyUserID, claims.UserID)
			ctx = context.WithValue(ctx, ContextKeyIsVIP, claims.IsVIP)
			ctx = context.WithValue(ctx, ContextKeyShadowbanned, claims.Shadowbanned)
			ctx = context.WithValue(ctx, ContextKeyIsAnonymous, claims.IsAnonymous)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// ──────────────────────────────────────────────────────────────
// Context Accessors
// ──────────────────────────────────────────────────────────────

// UserIDFromContext extracts the authenticated user's UUID from
// the request context. Returns uuid.Nil if the middleware has not
// run (i.e., on public routes).
func UserIDFromContext(ctx context.Context) uuid.UUID {
	id, _ := ctx.Value(ContextKeyUserID).(uuid.UUID)
	return id
}

// IsVIPFromContext extracts the VIP flag from the request context.
// Returns false if the middleware has not run.
func IsVIPFromContext(ctx context.Context) bool {
	vip, _ := ctx.Value(ContextKeyIsVIP).(bool)
	return vip
}

// IsShadowbannedFromContext extracts the shadowban flag from the
// request context. Returns false if the middleware has not run.
func IsShadowbannedFromContext(ctx context.Context) bool {
	sb, _ := ctx.Value(ContextKeyShadowbanned).(bool)
	return sb
}

// IsAnonymousFromContext extracts the guest-account flag from the
// request context. Returns false if the middleware has not run.
// Use this for fast guest-blocking without a DB lookup.
func IsAnonymousFromContext(ctx context.Context) bool {
	anon, _ := ctx.Value(ContextKeyIsAnonymous).(bool)
	return anon
}
