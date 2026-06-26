package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lynxus/internal/auth"
)

type AdminGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsNSFW      bool   `json:"is_nsfw"`
	Slowmode    int    `json:"slowmode_seconds"`
}

// requireAdmin fetches the caller's user record and returns true if they are an admin.
// Writes a 403 Forbidden response and returns false if not.
func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	userID := auth.UserIDFromContext(r.Context())
	user, err := s.Store.GetUserByID(r.Context(), userID)
	if err != nil || user == nil || !user.IsAdmin {
		respondError(w, http.StatusForbidden, "admin access required")
		return false
	}
	return true
}

// AdminCreateGroupHandler handles POST /api/admin/groups.
// Creates a new public group conversation. Admin-only.
func (s *Server) AdminCreateGroupHandler(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}

	var req AdminGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "group name is required")
		return
	}

	group, err := s.Store.CreateGroup(r.Context(), req.Name, req.Description, req.IsNSFW, req.Slowmode)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create group")
		return
	}

	respondJSON(w, http.StatusCreated, group)
}

// AdminUpdateGroupHandler handles PUT /api/admin/groups/{id}.
// Updates an existing group conversation. Admin-only.
func (s *Server) AdminUpdateGroupHandler(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group ID format")
		return
	}

	var req AdminGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "group name is required")
		return
	}

	group, err := s.Store.UpdateGroup(r.Context(), groupID, req.Name, req.Description, req.IsNSFW, req.Slowmode)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to update group")
		return
	}

	respondJSON(w, http.StatusOK, group)
}

// AdminDeleteGroupHandler handles DELETE /api/admin/groups/{id}.
// Deletes a group conversation and all its messages. Admin-only.
func (s *Server) AdminDeleteGroupHandler(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid group ID format")
		return
	}

	if err := s.Store.DeleteGroup(r.Context(), groupID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to delete group")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
