package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"TryBlynx/internal/db"
)

type AdminGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsNSFW      bool   `json:"is_nsfw"`
	Slowmode    int    `json:"slowmode_seconds"`
}

// AdminCreateGroupHandler handles creation of new group chats by admins.
func (s *Server) AdminCreateGroupHandler(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	if user == nil || !user.IsAdmin {
		http.Error(w, "Forbidden: Admin access required", http.StatusForbidden)
		return
	}

	var req AdminGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Group name is required", http.StatusBadRequest)
		return
	}

	group, err := s.store.CreateGroup(r.Context(), req.Name, req.Description, req.IsNSFW, req.Slowmode)
	if err != nil {
		http.Error(w, "Failed to create group", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(group)
}

// AdminUpdateGroupHandler handles editing of existing group chats by admins.
func (s *Server) AdminUpdateGroupHandler(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	if user == nil || !user.IsAdmin {
		http.Error(w, "Forbidden: Admin access required", http.StatusForbidden)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	var req AdminGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Group name is required", http.StatusBadRequest)
		return
	}

	group, err := s.store.UpdateGroup(r.Context(), groupID, req.Name, req.Description, req.IsNSFW, req.Slowmode)
	if err != nil {
		http.Error(w, "Failed to update group", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(group)
}

// AdminDeleteGroupHandler handles deleting of existing group chats by admins.
func (s *Server) AdminDeleteGroupHandler(w http.ResponseWriter, r *http.Request) {
	user := GetUserFromContext(r.Context())
	if user == nil || !user.IsAdmin {
		http.Error(w, "Forbidden: Admin access required", http.StatusForbidden)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, "Invalid group ID", http.StatusBadRequest)
		return
	}

	if err := s.store.DeleteGroup(r.Context(), groupID); err != nil {
		http.Error(w, "Failed to delete group", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
