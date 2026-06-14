// ═══════════════════════════════════════════════════════════════
// File:         internal/auth/jwt.go
// Purpose:      JWT token generation and validation (HMAC-SHA256)
// Dependencies: github.com/golang-jwt/jwt/v5, github.com/google/uuid
// Role:         Provides stateless authentication tokens for the
//               TryBlynx platform. Tokens carry the user's identity,
//               VIP status, and shadowban flag in custom claims.
//               Used by:
//               - api/auth_handlers.go (generation after login/register)
//               - auth/middleware.go   (validation on protected routes)
//               - ws/upgrader.go      (validation on WebSocket handshake)
// ═══════════════════════════════════════════════════════════════

package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Claims represents the custom JWT claims for TryBlynx.
//
// Fields:
//   - UserID:       The authenticated user's UUID (also stored in Subject).
//   - IsVIP:        Whether the user has an active VIP subscription.
//   - Shadowbanned: Whether the user is shadowbanned (used by the
//     matchmaker to isolate them into the shadow pool).
//   - IsAnonymous:  Whether the token belongs to a guest (ephemeral) account.
//     Guest accounts have limited access — they cannot send friend requests,
//     DMs, post to the feed, or update their profile.
//
// The RegisteredClaims embed provides standard fields: sub, iss,
// iat, exp. The token is signed with HS256.
type Claims struct {
	jwt.RegisteredClaims
	UserID       uuid.UUID `json:"uid"`
	IsVIP        bool      `json:"vip"`
	Shadowbanned bool      `json:"sb"`
	IsAnonymous  bool      `json:"anon,omitempty"`
}

// GenerateToken creates a new signed JWT for the given user.
//
// Parameters:
//   - secret:       The HMAC-SHA256 signing key (from config.JWTSecret).
//   - userID:       The user's UUID to embed in claims.
//   - isVIP:        Current VIP status of the user.
//   - shadowbanned: Current shadowban status of the user.
//   - isAnonymous:  Whether this is a guest (ephemeral) account.
//   - expiryHours:  Token lifetime in hours (from config.JWTExpiryHours).
//
// Returns:
//   - string: The compact-serialized JWT string (header.payload.signature).
//   - error:  Non-nil if signing fails (should not happen with valid key).
func GenerateToken(secret string, userID uuid.UUID, isVIP, shadowbanned, isAnonymous bool, expiryHours int) (string, error) {
	now := time.Now()

	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			Issuer:    "tryblynx",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(expiryHours) * time.Hour)),
		},
		UserID:       userID,
		IsVIP:        isVIP,
		Shadowbanned: shadowbanned,
		IsAnonymous:  isAnonymous,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", fmt.Errorf("auth: failed to sign token: %w", err)
	}

	return signed, nil
}

// ValidateToken parses a JWT string, verifies the HMAC-SHA256
// signature, checks expiration, and extracts the custom claims.
//
// Parameters:
//   - secret:   The HMAC-SHA256 signing key (must match the key
//     used in GenerateToken).
//   - tokenStr: The compact-serialized JWT to validate.
//
// Returns:
//   - *Claims: The extracted and validated claims.
//   - error:   Non-nil if the token is malformed, expired, uses
//     an unexpected signing method, or has an invalid signature.
func ValidateToken(secret, tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		// Enforce signing method to prevent algorithm-switching attacks
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

	return claims, nil
}
