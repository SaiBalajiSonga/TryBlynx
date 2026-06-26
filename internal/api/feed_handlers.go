// ═══════════════════════════════════════════════════════════════
// File:         internal/api/feed_handlers.go
// Purpose:      Global feed listing and post creation HTTP handlers
// Dependencies: internal/auth (context accessors), internal/db (via Store)
// Role:         Handles authenticated feed endpoints:
//               - GET  /api/feed → cursor-paginated global feed
//               - POST /api/feed → create a new text post
//               Text-only for V1. Cursor pagination uses RFC3339
//               timestamps to avoid offset-based pagination pitfalls
//               (no skipped/duplicate posts when new content arrives).
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"lynxus/internal/auth"
	"lynxus/internal/models"
)

// createFeedPostRequest defines the JSON body for POST /api/feed.
type createFeedPostRequest struct {
	Body string `json:"body"` // 1-5000 characters
}

// feedPostPublic is the API response shape for a feed post.
// Author is a *PublicUser (not *User) to prevent email leakage.
type feedPostPublic struct {
	ID        interface{}       `json:"id"`
	AuthorID  interface{}       `json:"author_id"`
	Body      string            `json:"body"`
	CreatedAt interface{}       `json:"created_at"`
	Author    *models.PublicUser `json:"author,omitempty"`
}

func toFeedPostPublic(p *models.FeedPost) feedPostPublic {
	fp := feedPostPublic{
		ID:        p.ID,
		AuthorID:  p.AuthorID,
		Body:      p.Body,
		CreatedAt: p.CreatedAt,
	}
	if p.Author != nil {
		pub := toPublicUser(p.Author)
		fp.Author = &pub
	}
	return fp
}

// GetFeedHandler handles GET /api/feed.
//
// Returns cursor-paginated global feed posts, newest first, with
// author information joined.
//
// Query parameters:
//   - cursor: RFC3339Nano timestamp. Only posts created before this
//     time are returned. Defaults to now (first page).
//   - limit:  Number of posts to return (1-100, default 20).
//
// Response: {"posts": [...], "count": N}
// Use the created_at of the last post as the cursor for the next page.
//
// Status codes:
//   - 200 OK:                 Feed returned (may be empty).
//   - 400 Bad Request:        Malformed cursor timestamp.
//   - 500 Internal Server Error: Database failure.
func (s *Server) GetFeedHandler(w http.ResponseWriter, r *http.Request) {
	// ── Parse cursor ─────────────────────────────────────────
	cursorStr := r.URL.Query().Get("cursor")
	cursor := time.Now()
	if cursorStr != "" {
		parsed, err := time.Parse(time.RFC3339Nano, cursorStr)
		if err != nil {
			respondError(w, http.StatusBadRequest,
				"invalid cursor format; use RFC3339 (e.g., 2024-01-01T00:00:00Z)")
			return
		}
		cursor = parsed
	}

	// ── Parse limit ──────────────────────────────────────────
	limit := 20
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	// ── Query database ───────────────────────────────────────
	posts, err := s.Store.GetFeedPosts(r.Context(), cursor, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch feed")
		return
	}

	publicPosts := make([]feedPostPublic, len(posts))
	for i := range posts {
		publicPosts[i] = toFeedPostPublic(&posts[i])
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"posts": publicPosts,
		"count": len(publicPosts),
	})
}

// CreateFeedPostHandler handles POST /api/feed.
//
// Creates a new text post on the global feed. The author is the
// authenticated user (from JWT claims).
//
// Request body:
//
//	{"body": "Hello, world!"}
//
// Validation:
//   - body must be non-empty (min 1 character).
//   - body must not exceed 5000 characters.
//
// Status codes:
//   - 201 Created:            Post created with author info attached.
//   - 400 Bad Request:        Empty or oversized body.
//   - 500 Internal Server Error: Database failure.
func (s *Server) CreateFeedPostHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req createFeedPostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// ── Validation ───────────────────────────────────────────
	if len(req.Body) == 0 {
		respondError(w, http.StatusBadRequest, "post body cannot be empty")
		return
	}
	if len(req.Body) > 5000 {
		respondError(w, http.StatusBadRequest, "post body too long (max 5000 characters)")
		return
	}

	// ── Create post ──────────────────────────────────────────
	var post *models.FeedPost
	if auth.IsShadowbannedFromContext(r.Context()) {
		// Stealth drop
		post = &models.FeedPost{
			ID:        uuid.New(),
			AuthorID:  userID,
			Body:      req.Body,
			CreatedAt: time.Now(),
		}
	} else {
		var err error
		post, err = s.Store.CreateFeedPost(r.Context(), userID, req.Body)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to create post")
			return
		}
	}

	// Attach author info for the response
	author, _ := s.Store.GetUserByID(r.Context(), userID)
	post.Author = author

	respondJSON(w, http.StatusCreated, toFeedPostPublic(post))
}
