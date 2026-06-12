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
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"tryblynx/internal/auth"
	"tryblynx/internal/models"
)

// toPublicUser converts a full models.User into the safe cross-user projection.
func toPublicUser(u *models.User) models.PublicUser {
	return models.PublicUser{
		ID:          u.ID,
		Username:    u.Username,
		DisplayName: u.DisplayName,
		AvatarURL:   u.AvatarURL,
		Bio:         u.Bio,
		Gender:      u.Gender,
		Location:    u.Location,
		Language:    u.Language,
		Interests:   u.Interests,
		IsVIP:       u.IsVIP,
		IsAnonymous: u.IsAnonymous,
		CreatedAt:   u.CreatedAt,
	}
}

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
	PublicKey   string   `json:"public_key"`
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
// For sensitive fields (display_name, avatar_url, bio), submits a moderation
// review rather than applying immediately. The moderator queue then approves
// or rejects the change via /api/mod/reviews.
//
// Non-sensitive fields (public_key, language, location, interests) are applied
// immediately without requiring review.
//
// Status codes:
//   - 200 OK:                 Non-sensitive fields applied immediately.
//   - 202 Accepted:           Review submitted for moderated fields.
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

	// ── Load current user (needed for old_data snapshot) ─────
	currentUser, err := s.Store.GetUserByID(r.Context(), userID)
	if err != nil || currentUser == nil {
		respondError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	// ── Apply non-sensitive fields immediately ────────────────
	// (public_key, language, location, interests do not need mod review)
	_, err = s.Store.UpdateUserProfile(
		r.Context(), userID,
		currentUser.DisplayName, currentUser.AvatarURL, currentUser.Bio, // keep existing moderated fields
		req.Gender, req.Location, req.Language, req.Interests, req.PublicKey,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	// ── Queue moderated fields for review if changed ──────────
	moderatedChanged := req.DisplayName != currentUser.DisplayName ||
		req.AvatarURL != currentUser.AvatarURL ||
		req.Bio != currentUser.Bio

	if moderatedChanged {
		oldDataJSON := fmt.Sprintf(
			`{"display_name":%q,"avatar_url":%q,"bio":%q}`,
			currentUser.DisplayName, currentUser.AvatarURL, currentUser.Bio,
		)
		newDataJSON := fmt.Sprintf(
			`{"display_name":%q,"avatar_url":%q,"bio":%q}`,
			req.DisplayName, req.AvatarURL, req.Bio,
		)
		if _, err := s.Store.CreateProfileReview(r.Context(), userID, oldDataJSON, newDataJSON); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to submit profile for review")
			return
		}
		respondJSON(w, http.StatusAccepted, map[string]string{
			"status":  "pending_review",
			"message": "Your display name, avatar, and bio changes are pending moderator review.",
		})
		return
	}

	// No moderated fields changed — return the updated user
	updatedUser, err := s.Store.GetUserByID(r.Context(), userID)
	if err != nil || updatedUser == nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch updated profile")
		return
	}
	respondJSON(w, http.StatusOK, updatedUser)
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

	respondJSON(w, http.StatusOK, toPublicUser(user))
}

// SearchUsersHandler handles GET /api/users/search?q={query}.
//
// Searches users by username or display_name.
//
// Status codes:
//   - 200 OK:                 List of matched users.
//   - 400 Bad Request:        Missing search query.
//   - 500 Internal Server Error: Database failure.
func (s *Server) SearchUsersHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		respondError(w, http.StatusBadRequest, "missing search query 'q'")
		return
	}

	users, err := s.Store.SearchUsers(r.Context(), query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to search users")
		return
	}

	pubUsers := make([]models.PublicUser, len(users))
	for i, u := range users {
		pubUsers[i] = toPublicUser(&u)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"users": pubUsers,
	})
}
