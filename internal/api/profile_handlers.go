// ═══════════════════════════════════════════════════════════════
// File:         internal/api/profile_handlers.go
// Purpose:      User profile retrieval and update HTTP handlers
// Dependencies: github.com/go-chi/chi/v5, github.com/google/uuid,
//               internal/auth (context accessors), internal/db (via Store)
// Role:         Handles authenticated profile endpoints:
//               - GET  /api/profile      → own profile
//               - PUT  /api/profile      → update own profile
//               - GET  /api/profile/{id} → view another user's profile
//               All routes require JWT authentication via middleware.
//               Profile updates are full-replacement (not partial patch):
//               the client must send all editable fields.
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"tryblynx/internal/auth"
)

// updateProfileRequest defines the JSON body for PUT /api/profile.
// All fields are required in the payload (full-replacement update).
// Fields left empty will be stored as empty strings.
type updateProfileRequest struct {
	DisplayName string   `json:"display_name"`
	AvatarURL   string   `json:"avatar_url"`
	Bio         string   `json:"bio"`
	Gender      string   `json:"gender"`    // male | female | other | unspecified
	Location    string   `json:"location"`  // ISO 3166 alpha-2 or city
	Language    string   `json:"language"`  // BCP-47 tag (e.g., "en", "fr")
	Interests   []string `json:"interests"` // array of interest tags
}

// validGenders is the set of accepted gender values, matching the
// CHECK constraint in 001_create_users.sql.
var validGenders = map[string]bool{
	"male":        true,
	"female":      true,
	"other":       true,
	"unspecified": true,
}

// GetProfileHandler handles GET /api/profile.
//
// Returns the authenticated user's full profile. The user ID is
// extracted from the JWT claims injected by auth.Middleware.
//
// Status codes:
//   - 200 OK:                 Profile returned.
//   - 404 Not Found:          User no longer exists (deleted account).
//   - 500 Internal Server Error: Database failure.
func (s *Server) GetProfileHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	user, err := s.Store.GetUserByID(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if user == nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	respondJSON(w, http.StatusOK, user)
}

// UpdateProfileHandler handles PUT /api/profile.
//
// Accepts a JSON body with all editable profile fields and
// updates the authenticated user's record. This is a full-
// replacement update: fields omitted from the payload will be
// stored as their zero values (empty string / empty slice).
//
// Validates gender against the allowed enum values. Defaults
// gender to "unspecified" and language to "en" if left empty.
//
// Status codes:
//   - 200 OK:                 Profile updated, new state returned.
//   - 400 Bad Request:        Invalid JSON or gender value.
//   - 500 Internal Server Error: Database failure.
func (s *Server) UpdateProfileHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req updateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// ── Input validation ─────────────────────────────────────
	if req.Gender != "" && !validGenders[req.Gender] {
		respondError(w, http.StatusBadRequest,
			"gender must be one of: male, female, other, unspecified")
		return
	}

	// Apply defaults for empty optional fields
	if req.Gender == "" {
		req.Gender = "unspecified"
	}
	if req.Language == "" {
		req.Language = "en"
	}
	if req.Interests == nil {
		req.Interests = []string{}
	}

	// ── Persist changes ──────────────────────────────────────
	user, err := s.Store.UpdateUserProfile(
		r.Context(), userID,
		req.DisplayName, req.AvatarURL, req.Bio,
		req.Gender, req.Location, req.Language, req.Interests,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	respondJSON(w, http.StatusOK, user)
}

// GetProfileByIDHandler handles GET /api/profile/{id}.
//
// Returns the public profile of any user by their UUID. This
// endpoint is authenticated to prevent anonymous scraping.
//
// Status codes:
//   - 200 OK:                 Profile returned.
//   - 400 Bad Request:        Malformed UUID in path.
//   - 404 Not Found:          No user with that ID.
//   - 500 Internal Server Error: Database failure.
func (s *Server) GetProfileByIDHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user ID format")
		return
	}

	user, err := s.Store.GetUserByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if user == nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	respondJSON(w, http.StatusOK, user)
}
