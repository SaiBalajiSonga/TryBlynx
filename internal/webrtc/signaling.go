// ═══════════════════════════════════════════════════════════════
// File:         internal/webrtc/signaling.go
// Purpose:      WebRTC signaling types and TURN credential generation
// Dependencies: crypto/hmac, crypto/sha1, encoding/base64
// Role:         Provides TURN server credential generation using
//               the Coturn static-auth-secret mechanism (TURN REST
//               API / time-limited credentials). The WebRTC SDP and
//               ICE candidate relay is handled by the WebSocket
//               handlers (internal/ws/handlers.go). This package
//               provides:
//               1. TURN credential generation for clients
//               2. ICE server configuration for the frontend
//
//               The credential generation follows RFC 5766 / Coturn's
//               --use-auth-secret mode: the username is a Unix
//               timestamp (credential expiry) and the password is
//               HMAC-SHA1(secret, username) base64-encoded.
// ═══════════════════════════════════════════════════════════════

package webrtc

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"time"
)

// ──────────────────────────────────────────────────────────────
// ICE Server Configuration
// ──────────────────────────────────────────────────────────────

// ICEServer represents a STUN or TURN server configuration that
// is sent to WebRTC clients for peer connection setup.
type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// ──────────────────────────────────────────────────────────────
// TURN Credential Generation
// ──────────────────────────────────────────────────────────────

// GenerateTURNCredentials creates time-limited TURN credentials
// using Coturn's static-auth-secret mechanism.
//
// The algorithm follows the TURN REST API specification:
//   - username = unix_timestamp (expiry time)
//   - password = base64(HMAC-SHA1(secret, username))
//
// Parameters:
//   - secret:   The Coturn static auth secret (COTURN_SECRET env var).
//   - turnHost: The TURN server hostname or IP (e.g., "localhost").
//   - ttl:      Credential validity duration (e.g., 24 * time.Hour).
//
// Returns:
//   - []ICEServer: A list of ICE servers including both STUN and
//     TURN configurations for the client.
func GenerateTURNCredentials(secret, turnHost string, ttl time.Duration) []ICEServer {
	// Calculate expiry timestamp
	expiry := time.Now().Add(ttl).Unix()
	username := fmt.Sprintf("%d", expiry)

	// Compute HMAC-SHA1
	mac := hmac.New(sha1.New, []byte(secret))
	mac.Write([]byte(username))
	credential := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return []ICEServer{
		{
			// STUN (no credentials needed)
			URLs: []string{
				fmt.Sprintf("stun:%s:3478", turnHost),
			},
		},
		{
			// TURN over UDP
			URLs: []string{
				fmt.Sprintf("turn:%s:3478?transport=udp", turnHost),
			},
			Username:   username,
			Credential: credential,
		},
		{
			// TURN over TCP (fallback for restrictive firewalls)
			URLs: []string{
				fmt.Sprintf("turn:%s:3478?transport=tcp", turnHost),
			},
			Username:   username,
			Credential: credential,
		},
		{
			// TURNS over TLS (most reliable through corporate firewalls)
			URLs: []string{
				fmt.Sprintf("turns:%s:5349?transport=tcp", turnHost),
			},
			Username:   username,
			Credential: credential,
		},
	}
}
