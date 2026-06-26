// ═══════════════════════════════════════════════════════════════
// File:         internal/api/history_handlers.go
// Purpose:      Master History Key (MHK) encrypted message history
// Dependencies: internal/auth, internal/db (via Server.Store)
// Role:         Handles two endpoints:
//               - POST /api/history/push        → client uploads MHK-encrypted entry
//               - GET  /api/history/{conversationId} → client fetches its own history
//
// The server stores opaque blobs. It has ZERO knowledge of message
// content — it cannot read, search, or index these ciphertexts.
// Only the owning user's device, which holds the locally-derived
// Master History Key, can decrypt the stored entries.
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lynxus/internal/auth"
)

// ──────────────────────────────────────────────────────────────
// Request Types
// ──────────────────────────────────────────────────────────────

// pushHistoryRequest is the body for POST /api/history/push.
// The client sends the AES-256-GCM encrypted message body.
type pushHistoryRequest struct {
	// UUID of the conversation this message belongs to.
	ConversationID string `json:"conversation_id"`
	// UUID of the original message (for deduplication).
	MessageID string `json:"message_id"`
	// Base64 AES-GCM nonce (12 bytes).
	IV string `json:"iv"`
	// Base64 AES-GCM ciphertext (encrypted plaintext body).
	// Encrypted under the client's locally-derived Master History Key.
	CT string `json:"ct"`
	// Original timestamp of the message. Used for ordering without decryption.
	SentAt time.Time `json:"sent_at"`
}

// ──────────────────────────────────────────────────────────────
// Handlers
// ──────────────────────────────────────────────────────────────

// PushHistoryHandler handles POST /api/history/push.
//
// Accepts a MHK-encrypted copy of a single message and stores it.
// Called client-side immediately after sending or receiving a message.
// Idempotent — duplicate pushes for the same message_id are silently ignored.
//
// Status codes:
//   - 204 No Content:         Entry stored.
//   - 400 Bad Request:        Missing or malformed fields.
//   - 401 Unauthorized:       Missing/invalid JWT.
//   - 500 Internal Server Error: Database failure.
func (s *Server) PushHistoryHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req pushHistoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ConversationID == "" || req.MessageID == "" || req.IV == "" || req.CT == "" {
		respondError(w, http.StatusBadRequest, "conversation_id, message_id, iv, and ct are required")
		return
	}

	conversationID, err := uuid.Parse(req.ConversationID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid conversation_id")
		return
	}
	messageID, err := uuid.Parse(req.MessageID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid message_id")
		return
	}

	sentAt := req.SentAt
	if sentAt.IsZero() {
		sentAt = time.Now()
	}

	if err := s.Store.PushMHKHistoryEntry(
		r.Context(),
		userID,
		conversationID,
		messageID,
		req.IV,
		req.CT,
		sentAt,
	); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to store history entry")
		return
	}

	respondJSON(w, http.StatusNoContent, nil)
}

// GetHistoryHandler handles GET /api/history/{conversationId}.
//
// Returns paginated MHK-encrypted history entries for the authenticated
// user's conversation. Entries are returned newest-first; the client
// requests more as the user scrolls backward (lazy loading).
//
// Query params:
//   - cursor: ISO-8601 timestamp; only messages before this time are returned.
//             Defaults to now() if omitted (returns most recent 50 messages).
//   - limit:  Max entries to return (1-100, default 50).
//
// Status codes:
//   - 200 OK:    Entries array returned (may be empty).
//   - 400 Bad Request: Invalid conversation_id or cursor.
//   - 401 Unauthorized.
//   - 403 Forbidden:   Requesting another user's history.
//   - 500 Internal Server Error.
func (s *Server) GetHistoryHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	conversationIDStr := chi.URLParam(r, "conversationId")
	conversationID, err := uuid.Parse(conversationIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid conversation id")
		return
	}

	// Parse optional cursor (timestamp)
	cursor := time.Now().Add(time.Second) // slightly future so "now" messages are included
	if cursorStr := r.URL.Query().Get("cursor"); cursorStr != "" {
		parsed, err := time.Parse(time.RFC3339Nano, cursorStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "invalid cursor: must be RFC3339")
			return
		}
		cursor = parsed
	}

	// Parse optional limit
	limit := 50
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		_, err := json.Number(limitStr).Int64()
		if err == nil {
			n, _ := json.Number(limitStr).Int64()
			limit = int(n)
		}
	}

	entries, err := s.Store.GetMHKHistory(r.Context(), userID, conversationID, cursor, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to retrieve history")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"entries": entries,
	})
}

// SaveRecoveryBlobHandler handles PUT /api/recovery/blob.
// Stores the mnemonic-encrypted MHK salt blob. Called once during
// signup (after the user is shown their 12-word phrase).
func (s *Server) SaveRecoveryBlobHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		Blob string `json:"blob"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Blob == "" {
		respondError(w, http.StatusBadRequest, "blob is required")
		return
	}

	if err := s.Store.SaveRecoveryBlob(r.Context(), userID, body.Blob); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save recovery blob")
		return
	}

	respondJSON(w, http.StatusNoContent, nil)
}

// GetRecoveryBlobHandler handles GET /api/recovery/blob.
// Returns the encrypted blob so the client can derive the MHK from
// the recovery phrase during a Scenario B password reset.
func (s *Server) GetRecoveryBlobHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blob, err := s.Store.GetRecoveryBlob(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to retrieve recovery blob")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"blob": blob})
}
