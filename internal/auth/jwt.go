// ═══════════════════════════════════════════════════════════════
// File:         internal/auth/jwt.go
// Purpose:      JWT token generation and validation (HMAC-SHA256)
// Dependencies: github.com/golang-jwt/jwt/v5, github.com/google/uuid
// Role:         Provides stateless authentication tokens for the
//               Lynxus platform. Tokens carry the user's identity,
//               VIP status, and shadowban flag in custom claims.
//               Used by:
//               - api/auth_handlers.go (generation after login/register)
//               - auth/middleware.go   (validation on protected routes)
//               - ws/upgrader.go      (validation on WebSocket handshake)
// ═══════════════════════════════════════════════════════════════

package auth

import (
	"fmt"
	"sync"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	jwksCache keyfunc.Keyfunc
	jwksInit  sync.Once
)

// InitJWKS initializes the JWKS cache by fetching keys from Supabase
func InitJWKS(supabaseURL string) error {
	var initErr error
	jwksInit.Do(func() {
		jwksURL := fmt.Sprintf("%s/auth/v1/.well-known/jwks.json", supabaseURL)
		k, err := keyfunc.NewDefault([]string{jwksURL})
		if err != nil {
			initErr = fmt.Errorf("failed to create JWKS from %s: %w", jwksURL, err)
			return
		}
		jwksCache = k
	})
	return initErr
}

// Claims represents the custom JWT claims for Lynxus.
// Under Supabase Auth, the user's UUID is stored in the standard Subject ("sub") claim,
// and the email is stored in the "email" claim.
type Claims struct {
	jwt.RegisteredClaims
	Email  string    `json:"email"`
	UserID uuid.UUID `json:"-"` // Extracted from Subject ("sub") post-parsing
}

// ValidateToken parses a JWT string, verifies the signature using the cached JWKS
// (or falls back to HMAC-SHA256 if the token is old), checks expiration, and extracts claims.
func ValidateToken(secret, tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		// If Supabase has migrated to ES256/RS256, use JWKS
		if t.Method.Alg() != "HS256" {
			if jwksCache == nil {
				return nil, fmt.Errorf("auth: JWKS not initialized for %v", t.Method.Alg())
			}
			return jwksCache.Keyfunc(t)
		}
		
		// Fallback for legacy HS256 tokens
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("auth: unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("auth: invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("auth: invalid token claims")
	}

	// Extract and parse UserID from Subject ("sub")
	if claims.Subject == "" {
		return nil, fmt.Errorf("auth: missing subject claim")
	}
	uid, err := uuid.Parse(claims.Subject)
	if err != nil {
		return nil, fmt.Errorf("auth: invalid subject UUID: %w", err)
	}
	claims.UserID = uid

	return claims, nil
}
