package api

import (
	"net/http"

	"tryblynx/internal/auth"
)

// DeleteAccountHandler handles DELETE /api/account/delete.
// Permanently deletes the authenticated user's account and all their data.
func (s *Server) DeleteAccountHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	if err := s.Store.DeleteUser(r.Context(), userID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete account")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
