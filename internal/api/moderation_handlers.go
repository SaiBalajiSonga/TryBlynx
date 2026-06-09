package api

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"tryblynx/internal/auth"
)

type blockRequest struct {
	BlockedID uuid.UUID `json:"blocked_id"`
}

type reportRequest struct {
	ReportedID uuid.UUID  `json:"reported_id"`
	MessageID  *uuid.UUID `json:"message_id,omitempty"`
	Reason     string     `json:"reason"`
}

// BlockUserHandler handles POST /api/moderation/block
func (s *Server) BlockUserHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req blockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := s.Store.BlockUser(r.Context(), userID, req.BlockedID); err != nil {
		if err.Error() == "db: cannot block self" {
			respondError(w, http.StatusBadRequest, "cannot block yourself")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to block user")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "blocked"})
}

// UnblockUserHandler handles POST /api/moderation/unblock
func (s *Server) UnblockUserHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req blockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := s.Store.UnblockUser(r.Context(), userID, req.BlockedID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to unblock user")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "unblocked"})
}

// ReportUserHandler handles POST /api/moderation/report
func (s *Server) ReportUserHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req reportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Reason == "" {
		respondError(w, http.StatusBadRequest, "reason is required")
		return
	}

	if err := s.Store.ReportUser(r.Context(), userID, req.ReportedID, req.MessageID, req.Reason); err != nil {
		if err.Error() == "db: cannot report self" {
			respondError(w, http.StatusBadRequest, "cannot report yourself")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to file report")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{"status": "reported"})
}

type fingerprintRequest struct {
	Fingerprint string `json:"fingerprint"`
}

// FingerprintHandler handles POST /api/moderation/fingerprint
func (s *Server) FingerprintHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	var req fingerprintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Fingerprint == "" {
		respondError(w, http.StatusBadRequest, "fingerprint is required")
		return
	}

	if err := s.Store.UpdateUserFingerprint(r.Context(), userID, req.Fingerprint); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update fingerprint")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "fingerprint updated"})
}

// StrikeHandler handles POST /api/moderation/strike
// Logs an AI detection strike against the user and returns the ban escalation.
func (s *Server) StrikeHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	bannedUntil, err := s.Store.LogUserStrike(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to log strike")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status": "strike_logged",
		"banned_until": bannedUntil,
	})
}

