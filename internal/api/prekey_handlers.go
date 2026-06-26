// ═══════════════════════════════════════════════════════════════
// File:         internal/api/prekey_handlers.go
// Purpose:      PQXDH Pre-Key Bundle HTTP handlers
// Dependencies: internal/auth, internal/db (via Server.Store)
// Role:         Handles two endpoints:
//               - POST /api/keys/upload  → client uploads key bundle
//               - GET  /api/keys/fetch/{userId} → sender fetches bundle
//
// The server is a "dumb pipe" for public keys — it stores and serves
// base64-encoded public key material but can never derive any secrets.
// Private keys are NEVER transmitted here.
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lynxus/internal/auth"
	"lynxus/internal/models"
)

// ──────────────────────────────────────────────────────────────
// Request / Response Types
// ──────────────────────────────────────────────────────────────

// uploadPreKeysRequest is the body for POST /api/keys/upload.
// The client sends all public key material for one device at once.
type uploadPreKeysRequest struct {
	// Human-readable label for this device, e.g. "Chrome on MacBook".
	DeviceLabel string `json:"device_label"`
	// Base64 X25519 long-term identity public key.
	IdentityKey string `json:"identity_key"`
	// Base64 X25519 signed pre-key public key (rotated weekly).
	SignedPreKey string `json:"signed_pre_key"`
	// Numeric ID used to reference this SPK in handshake messages.
	SignedPreKeyID int `json:"signed_pre_key_id"`
	// Base64 Ed25519 signature of the SPK bytes, signed by the IK.
	// Recipients verify this to detect MITM tampering with the SPK.
	SignedPreKeySignature string `json:"signed_pre_key_sig"`
	// Batch of one-time X25519 pre-keys (forward secrecy per session).
	OneTimeKeys []models.OneTimeKey `json:"one_time_keys"`
	// Batch of one-time ML-KEM-768 post-quantum keys (quantum resistance).
	PQKeys []models.OneTimeKey `json:"pq_keys"`
}

// UploadPreKeysHandler handles POST /api/keys/upload.
//
// The authenticated user registers their device's pre-key bundle so
// that other users can initiate PQXDH sessions without the device
// being online (asynchronous key exchange).
//
// Status codes:
//   - 204 No Content:         Bundle stored successfully.
//   - 400 Bad Request:        Missing required fields.
//   - 401 Unauthorized:       Missing/invalid JWT.
//   - 500 Internal Server Error: Database failure.
func (s *Server) UploadPreKeysHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == uuid.Nil {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req uploadPreKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate required fields
	if req.IdentityKey == "" || req.SignedPreKey == "" || req.SignedPreKeySignature == "" {
		respondError(w, http.StatusBadRequest, "identity_key, signed_pre_key, and signed_pre_key_sig are required")
		return
	}
	if req.DeviceLabel == "" {
		req.DeviceLabel = "Unknown Device"
	}

	ctx := r.Context()

	// Create or look up this device. For simplicity, we create a new
	// device entry on each upload call. In production, the client would
	// persist the returned device_id in localStorage and reuse it.
	deviceID, err := s.Store.RegisterDevice(ctx, userID, req.DeviceLabel)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to register device")
		return
	}

	// Store the Identity Key + Signed Pre-Key (upsert)
	if err := s.Store.UpsertPreKeyBundle(ctx, deviceID,
		req.IdentityKey, req.SignedPreKey, req.SignedPreKeyID, req.SignedPreKeySignature,
	); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to save pre-key bundle")
		return
	}

	// Store one-time X25519 keys
	if len(req.OneTimeKeys) > 0 {
		if err := s.Store.InsertOneTimeKeys(ctx, deviceID, req.OneTimeKeys); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save one-time keys")
			return
		}
	}

	// Store one-time ML-KEM-768 post-quantum keys
	if len(req.PQKeys) > 0 {
		if err := s.Store.InsertPQKeys(ctx, deviceID, req.PQKeys); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to save PQ keys")
			return
		}
	}

	respondJSON(w, http.StatusNoContent, nil)
}

// FetchPreKeyBundleHandler handles GET /api/keys/fetch/{userId}.
//
// Returns the target user's latest pre-key bundle. One OTK and one
// PQK are atomically consumed (deleted) from the user's key pool and
// included in the response for use in a single PQXDH handshake.
//
// Status codes:
//   - 200 OK:                 Bundle returned.
//   - 400 Bad Request:        Invalid user ID.
//   - 404 Not Found:          Target user has no key bundle registered.
//   - 500 Internal Server Error: Database failure.
func (s *Server) FetchPreKeyBundleHandler(w http.ResponseWriter, r *http.Request) {
	recipientIDStr := chi.URLParam(r, "userId")
	recipientID, err := uuid.Parse(recipientIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	bundle, err := s.Store.GetPreKeyBundle(r.Context(), recipientID)
	if err != nil {
		respondError(w, http.StatusNotFound, "no pre-key bundle found for this user")
		return
	}

	respondJSON(w, http.StatusOK, bundle)
}
