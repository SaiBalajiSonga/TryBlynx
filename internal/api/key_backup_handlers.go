package api

import (
	"encoding/json"
	"net/http"

	"tryblynx/internal/auth"
)

// SaveKeyBackupHandler handles PUT /api/key-backup.
//
// Stores an encrypted private-key backup blob for the authenticated user.
// The blob is created client-side by encrypting the RSA private key with a
// PBKDF2-derived AES key. The server never sees the passphrase or plaintext key.
//
// Request body: { "blob": "<json string>" }
// Max body size: 16 KB (enforced before JSON decode to prevent DoS).
func (s *Server) SaveKeyBackupHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	// Limit body size BEFORE reading to prevent a large-body DoS attack.
	// A legitimate RSA-2048 JWK encrypted with AES-256-GCM and base64-encoded
	// fits comfortably under 4 KB; 16 KB is a generous upper bound.
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)

	var body struct {
		Blob string `json:"blob"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Blob == "" {
		respondError(w, http.StatusBadRequest, "blob is required")
		return
	}
	if len(body.Blob) > 8192 {
		respondError(w, http.StatusBadRequest, "blob too large (max 8 KB)")
		return
	}

	if err := s.Store.SaveKeyBackup(r.Context(), userID, body.Blob); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save key backup")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// GetKeyBackupHandler handles GET /api/key-backup.
//
// Returns the encrypted key backup blob for the authenticated user.
// Returns 404 if no backup has been saved yet.
func (s *Server) GetKeyBackupHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	blob, err := s.Store.GetKeyBackup(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to retrieve key backup")
		return
	}
	if blob == "" {
		respondError(w, http.StatusNotFound, "no key backup found")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"blob": blob})
}
