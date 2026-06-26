// ═══════════════════════════════════════════════════════════════
// File:         internal/api/auth_handlers.go
// Purpose:      User profile synchronization with Supabase Auth
// Dependencies: internal/auth, internal/db (via Server.Store)
// Role:         Handles the public profile sync endpoint:
//               - POST /api/auth/sync: Verify Supabase JWT and sync
//                                      profile keys to Postgres.
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"lynxus/internal/auth"
)

// syncRequest is the expected JSON body for POST /api/auth/sync.
type syncRequest struct {
	Username            string `json:"username"`
	Fingerprint         string `json:"fingerprint"`
	PublicKey           string `json:"public_key"`
	EncryptedPrivateKey string `json:"encrypted_private_key"`
}

// syncResponse is returned on successful profile sync.
type syncResponse struct {
	User                interface{} `json:"user"`
	EncryptedPrivateKey string      `json:"encrypted_private_key,omitempty"`
}

// SyncProfileHandler handles POST /api/auth/sync.
//
// Extracts the Supabase JWT from the Authorization header, validates it,
// extracts the User UUID and Email, and inserts/syncs the profile
// details in our local PostgreSQL database.
//
// Status codes:
//   - 201 Created:            Profile synced successfully.
//   - 400 Bad Request:        Missing or invalid fields / missing token.
//   - 401 Unauthorized:       Invalid or expired Supabase JWT.
//   - 409 Conflict:           Username already taken.
//   - 500 Internal Server Error: Database failure.
func (s *Server) SyncProfileHandler(w http.ResponseWriter, r *http.Request) {
	// ── Extract JWT from header ──────────────────────────────
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		respondError(w, http.StatusBadRequest, "missing authorization header")
		return
	}

	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	if tokenStr == authHeader {
		respondError(w, http.StatusBadRequest, "invalid authorization format, expected: Bearer <token>")
		return
	}

	// ── Validate JWT ─────────────────────────────────────────
	claims, err := auth.ValidateToken(s.Config.JWTSecret, tokenStr)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid or expired token")
		return
	}

	var req syncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// ── Input validation ─────────────────────────────────────
	req.Username = strings.TrimSpace(req.Username)
	claims.Email = strings.TrimSpace(strings.ToLower(claims.Email))

	if req.Username == "" {
		respondError(w, http.StatusBadRequest, "username is required")
		return
	}
	if len(req.Username) < 3 || len(req.Username) > 32 {
		respondError(w, http.StatusBadRequest, "username must be 3-32 characters")
		return
	}
	if claims.Email == "" {
		respondError(w, http.StatusBadRequest, "token must contain a valid email address")
		return
	}

	// ── Check Device Ban ─────────────────────────────────────
	if req.Fingerprint != "" {
		isBanned, err := s.Store.CheckDeviceBan(r.Context(), req.Fingerprint)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to verify device status")
			return
		}
		if isBanned {
			respondError(w, http.StatusForbidden, "This device is temporarily suspended from registering new accounts.")
			return
		}
	}

	// ── Check if profile already exists in DB ───────────────
	existing, err := s.Store.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if existing != nil {
		respondError(w, http.StatusConflict, "user profile already synced")
		return
	}

	// ── Create user in database using Supabase UserID ────────
	// password_hash is inserted as an empty string since password authentication
	// is offloaded to Supabase Auth.
	user, err := s.Store.CreateUser(r.Context(), claims.UserID, req.Username, claims.Email, "", req.PublicKey, req.EncryptedPrivateKey)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			respondError(w, http.StatusConflict, "username or email already taken")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to sync user profile")
		return
	}

	// ── Store Fingerprint ────────────────────────────────────
	if req.Fingerprint != "" {
		_ = s.Store.UpdateUserFingerprint(r.Context(), user.ID, req.Fingerprint)
	}

	respondJSON(w, http.StatusCreated, syncResponse{User: user, EncryptedPrivateKey: user.EncryptedPrivateKey})
}

// CheckUsernameHandler handles GET /api/auth/check-username
func (s *Server) CheckUsernameHandler(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		respondError(w, http.StatusBadRequest, "username is required")
		return
	}

	user, err := s.Store.GetUserByUsername(r.Context(), username)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}

	if user == nil {
		// Username is available
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"available": true,
		})
		return
	}

	// Username is taken, generate 3 suggestions
	suggestions := []string{}
	rand.Seed(time.Now().UnixNano())

	// Strategy 1: append a random number
	for i := 0; i < 5; i++ {
		suggestion := fmt.Sprintf("%s%d", username, rand.Intn(999)+1)
		u, _ := s.Store.GetUserByUsername(r.Context(), suggestion)
		if u == nil {
			suggestions = append(suggestions, suggestion)
			break
		}
	}

	// Strategy 2: append underscore and random number
	for i := 0; i < 5; i++ {
		suggestion := fmt.Sprintf("%s_%d", username, rand.Intn(99)+1)
		u, _ := s.Store.GetUserByUsername(r.Context(), suggestion)
		if u == nil {
			suggestions = append(suggestions, suggestion)
			break
		}
	}

	// Strategy 3: prefix with "the_"
	theSuggestion := fmt.Sprintf("the_%s", username)
	u, _ := s.Store.GetUserByUsername(r.Context(), theSuggestion)
	if u == nil {
		suggestions = append(suggestions, theSuggestion)
	} else {
		// Fallback
		suggestion := fmt.Sprintf("%s%d", username, rand.Intn(9999)+1000)
		suggestions = append(suggestions, suggestion)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"available":   false,
		"suggestions": suggestions,
	})
}
