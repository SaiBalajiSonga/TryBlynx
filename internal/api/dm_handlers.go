// ═══════════════════════════════════════════════════════════════
// File:         internal/api/dm_handlers.go
// Purpose:      Direct message conversation and messaging handlers
// Dependencies: github.com/go-chi/chi/v5, github.com/google/uuid,
//               internal/auth, internal/db (via Store)
// Role:         Handles authenticated DM endpoints:
//               - GET  /api/dm/list                → list user's conversations
//               - POST /api/dm/send                → send a DM to a user
//               - GET  /api/dm/{conversationId}    → fetch message history
//               Uses the get_or_create_dm() PostgreSQL function for
//               atomic DM conversation creation. Enforces membership
//               authorization before exposing message history.
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lynxus/internal/models"

	"lynxus/internal/auth"
)

// sendDMRequest defines the JSON body for POST /api/dm/send.
type sendDMRequest struct {
	RecipientID string `json:"recipient_id"` // UUID of the target user
	Body        string `json:"body"`         // 1-5000 characters
}

// ListDMsHandler handles GET /api/dm/list.
//
// Returns all DM conversations the authenticated user is a member of,
// ordered by most recent activity. Includes the peer's profile info.
//
// Online status is intentionally NOT included here. It is pushed in
// real-time via 'presence.update' WebSocket events so the frontend
// always has current data without polling. Including it here would add
// a Redis HMGET on every list refresh with zero freshness benefit.
func (s *Server) ListDMsHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	dms, err := s.Store.GetUserDMs(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch conversations")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"conversations": dms,
		"count":         len(dms),
	})
}

// SendDMHandler handles POST /api/dm/send.
//
// Sends a text message to another user. If no DM conversation
// exists between the two users, one is created atomically via the
// get_or_create_dm() PostgreSQL function. The function ensures
// only one DM conversation exists per user pair.
//
// Request body:
//
//	{"recipient_id": "uuid", "body": "Hello!"}
//
// Validation:
//   - recipient_id must be a valid UUID and not the sender's own ID.
//   - recipient must exist in the database.
//   - body must be 1-5000 characters.
//
// Status codes:
//   - 201 Created:            Message sent, message object returned.
//   - 400 Bad Request:        Invalid recipient, empty body, or self-DM.
//   - 404 Not Found:          Recipient does not exist.
//   - 500 Internal Server Error: Database failure.
func (s *Server) SendDMHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req sendDMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// ── Input validation ─────────────────────────────────────
	recipientID, err := uuid.Parse(req.RecipientID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid recipient_id format")
		return
	}
	if recipientID == userID {
		respondError(w, http.StatusBadRequest, "cannot send a DM to yourself")
		return
	}
	if len(req.Body) == 0 {
		respondError(w, http.StatusBadRequest, "message body cannot be empty")
		return
	}
	if len(req.Body) > 5000 {
		respondError(w, http.StatusBadRequest, "message too long (max 5000 characters)")
		return
	}

	// ── Verify recipient exists ──────────────────────────────
	recipient, err := s.Store.GetUserByID(r.Context(), recipientID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if recipient == nil {
		respondError(w, http.StatusNotFound, "recipient not found")
		return
	}

	// ── Require an accepted friendship ───────────────────────
	isFriend, err := s.Store.IsFriend(r.Context(), userID, recipientID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if !isFriend {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "not_friends",
			"message": "You must be friends to send direct messages.",
		})
		return
	}

	// ── Get or create DM conversation ────────────────────────
	convID, err := s.Store.GetOrCreateDM(r.Context(), userID, recipientID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to initialize conversation")
		return
	}

	// ── Persist message ──────────────────────────────────────
	var msg *models.Message
	if auth.IsShadowbannedFromContext(r.Context()) {
		// Stealth drop
		msg = &models.Message{
			ID:             uuid.New(),
			ConversationID: convID,
			SenderID:       &userID,
			Body:           req.Body,
			CreatedAt:      time.Now(),
		}
	} else {
		var err error
		msg, err = s.Store.CreateMessage(r.Context(), convID, userID, req.Body, nil)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to send message")
			return
		}
	}

	// Populate SenderName so the REST response matches the WS message
	// shape. Fetch caller here (after the fast guest-check above) only
	// for the display name — one DB lookup, not two.
	caller, err := s.Store.GetUserByID(r.Context(), userID)
	if err == nil && caller != nil {
		msg.SenderName = caller.Username
		if caller.DisplayName != "" {
			msg.SenderName = caller.DisplayName
		}
	}

	respondJSON(w, http.StatusCreated, msg)
}

// GetDMMessagesHandler handles GET /api/dm/{conversationId}.
//
// Returns cursor-paginated messages for a conversation. The
// authenticated user must be a member of the conversation
// (enforced via conversation_members lookup).
//
// Query parameters:
//   - cursor: RFC3339Nano timestamp. Only messages before this time
//     are returned. Defaults to now (first page).
//   - limit:  Number of messages to return (1-100, default 50).
//
// Status codes:
//   - 200 OK:                 Messages returned (may be empty).
//   - 400 Bad Request:        Malformed UUID or cursor.
//   - 403 Forbidden:          User is not a member of the conversation.
//   - 500 Internal Server Error: Database failure.
func (s *Server) GetDMMessagesHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	// ── Parse conversation ID ────────────────────────────────
	convIDStr := chi.URLParam(r, "conversationId")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid conversation ID format")
		return
	}

	// ── Authorization: auto-join public groups or verify membership ──
	isMember, err := s.Store.CheckPublicGroupAccess(r.Context(), convID, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if !isMember {
		respondError(w, http.StatusForbidden, "you are not a member of this conversation")
		return
	}

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
	limit := 50
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	// ── Fetch messages ───────────────────────────────────────
	msgs, err := s.Store.GetMessages(r.Context(), userID, convID, cursor, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch messages")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"messages": msgs,
		"count":    len(msgs),
	})
}

// ListGroupsHandler handles GET /api/groups.
// Returns all public group conversations available to join.
func (s *Server) ListGroupsHandler(w http.ResponseWriter, r *http.Request) {
	groups, err := s.Store.GetAllGroups(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch groups")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"groups": groups,
		"count":  len(groups),
	})
}

// GetGroupMembersHandler handles GET /api/groups/{id}/members.
// Returns all active live members currently looking at the conversation.
// Returns PublicUser (no email, no sensitive fields) — same shape as search/profile-by-ID.
func (s *Server) GetGroupMembersHandler(w http.ResponseWriter, r *http.Request) {
	convIDStr := chi.URLParam(r, "id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group ID format")
		return
	}

	// 1. Fetch live user IDs from Redis presence
	activeUserIDs, err := s.Store.GetRoomPresenceUsers(r.Context(), convID.String())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch live presence")
		return
	}

	// 2. Fetch full user models from PostgreSQL
	members, err := s.Store.GetUsersByIDs(r.Context(), activeUserIDs)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch member details")
		return
	}

	// 3. Convert to PublicUser — never expose email or internal moderation fields
	pubMembers := make([]models.PublicUser, len(members))
	for i, u := range members {
		pubMembers[i] = toPublicUser(&u)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"members": pubMembers,
		"count":   len(pubMembers),
	})
}

// ClearDMMessagesHandler handles DELETE /api/dm/{conversationId}.
// Clears all messages in a DM conversation for the authenticated user.
func (s *Server) ClearDMMessagesHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	convIDStr := chi.URLParam(r, "conversationId")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid conversation ID format")
		return
	}

	// ── Authorization: Verify membership ──
	isMember, err := s.Store.IsConversationMember(r.Context(), convID, userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if !isMember {
		respondError(w, http.StatusForbidden, "you are not a member of this conversation")
		return
	}

	if err := s.Store.ClearConversationMessages(r.Context(), convID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to clear messages")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
}
