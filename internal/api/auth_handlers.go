// ═══════════════════════════════════════════════════════════════
// File:         internal/api/auth_handlers.go
// Purpose:      User registration and login HTTP handlers
// Dependencies: golang.org/x/crypto/bcrypt, internal/auth,
//               internal/db (via Server.Store)
// Role:         Handles the public authentication endpoints:
//               - POST /api/register: Create account + return JWT
//               - POST /api/login:    Verify credentials + return JWT
//               These are the only code paths that generate JWTs.
//               Passwords are hashed with bcrypt at DefaultCost (10).
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"tryblynx/internal/auth"
)

// ──────────────────────────────────────────────────────────────
// Request / Response Types
// ──────────────────────────────────────────────────────────────

// registerRequest is the expected JSON body for POST /api/register.
type registerRequest struct {
	Username            string `json:"username"`
	Email               string `json:"email"`
	Password            string `json:"password"`
	Fingerprint         string `json:"fingerprint"`
	PublicKey           string `json:"public_key"`
	EncryptedPrivateKey string `json:"encrypted_private_key"`
}

// loginRequest is the expected JSON body for POST /api/login.
type loginRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	Fingerprint string `json:"fingerprint"`
}

// authResponse is the standard response for successful auth operations.
// Contains the JWT and the full user profile (sans sensitive fields).
// EncryptedPrivateKey is included here explicitly because models.User
// tags it json:"-" (to prevent cross-user exposure), but the authenticating
// user needs their own encrypted key to restore their E2EE private key.
type authResponse struct {
	Token               string      `json:"token"`
	User                interface{} `json:"user"`
	EncryptedPrivateKey string      `json:"encrypted_private_key,omitempty"`
}

// ──────────────────────────────────────────────────────────────
// Handlers
// ──────────────────────────────────────────────────────────────

// RegisterHandler handles POST /api/register.
//
// Accepts a JSON body with username, email, and password.
// Validates input, hashes the password with bcrypt, creates the
// user in PostgreSQL, and returns a signed JWT.
//
// Status codes:
//   - 201 Created:            User created, token returned.
//   - 400 Bad Request:        Missing or invalid fields.
//   - 409 Conflict:           Username or email already taken.
//   - 500 Internal Server Error: Hash or database failure.
func (s *Server) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// ── Input validation ─────────────────────────────────────
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if req.Username == "" || req.Email == "" || req.Password == "" {
		respondError(w, http.StatusBadRequest, "username, email, and password are required")
		return
	}
	if len(req.Username) < 3 || len(req.Username) > 32 {
		respondError(w, http.StatusBadRequest, "username must be 3-32 characters")
		return
	}
	if len(req.Password) < 8 {
		respondError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if !strings.Contains(req.Email, "@") || !strings.Contains(req.Email, ".") {
		respondError(w, http.StatusBadRequest, "invalid email format")
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

	// ── Hash password ────────────────────────────────────────
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to process password")
		return
	}

	// ── Check for existing user ──────────────────────────────
	existing, err := s.Store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if existing != nil {
		respondError(w, http.StatusConflict, "email already registered")
		return
	}

	// ── Create user in database ──────────────────────────────
	user, err := s.Store.CreateUser(r.Context(), req.Username, req.Email, string(hash), req.PublicKey, req.EncryptedPrivateKey)
	if err != nil {
		// Handle race condition: another request inserted between check and insert
		if strings.Contains(err.Error(), "duplicate key") {
			respondError(w, http.StatusConflict, "username or email already taken")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	// ── Store Fingerprint ────────────────────────────────────
	if req.Fingerprint != "" {
		_ = s.Store.UpdateUserFingerprint(r.Context(), user.ID, req.Fingerprint)
	}

	// ── Generate JWT ─────────────────────────────────────────
	token, err := auth.GenerateToken(
		s.Config.JWTSecret, user.ID, user.IsVIP, user.Shadowbanned,
		s.Config.JWTExpiryHours,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	respondJSON(w, http.StatusCreated, authResponse{Token: token, User: user, EncryptedPrivateKey: user.EncryptedPrivateKey})
}

// LoginHandler handles POST /api/login.
//
// Accepts a JSON body with email and password. Looks up the user,
// verifies the bcrypt hash, and returns a fresh JWT on success.
//
// Security: Uses the same generic error message for "user not found"
// and "wrong password" to prevent email enumeration.
//
// Status codes:
//   - 200 OK:                 Credentials valid, token returned.
//   - 400 Bad Request:        Missing fields.
//   - 401 Unauthorized:       Invalid email or password.
//   - 500 Internal Server Error: Database failure.
func (s *Server) LoginHandler(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// ── Input validation ─────────────────────────────────────
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		respondError(w, http.StatusBadRequest, "email and password are required")
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
			respondError(w, http.StatusForbidden, "This device is temporarily suspended.")
			return
		}
	}

	// ── Look up user ─────────────────────────────────────────
	user, err := s.Store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if user == nil {
		// Generic message prevents email enumeration
		respondError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	// ── Verify password ──────────────────────────────────────
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		respondError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	// ── Check if banned ──────────────────────────────────────
	if user.BannedUntil != nil && user.BannedUntil.After(time.Now()) {
		respondError(w, http.StatusForbidden, "Account is temporarily suspended until " + user.BannedUntil.Format(time.RFC1123))
		return
	}

	// ── Store Fingerprint ────────────────────────────────────
	if req.Fingerprint != "" && user.DeviceFingerprint != req.Fingerprint {
		_ = s.Store.UpdateUserFingerprint(r.Context(), user.ID, req.Fingerprint)
	}

	// ── Generate JWT ─────────────────────────────────────────
	token, err := auth.GenerateToken(
		s.Config.JWTSecret, user.ID, user.IsVIP, user.Shadowbanned,
		s.Config.JWTExpiryHours,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	respondJSON(w, http.StatusOK, authResponse{Token: token, User: user, EncryptedPrivateKey: user.EncryptedPrivateKey})
}
