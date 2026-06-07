// ═══════════════════════════════════════════════════════════════
// File:         internal/ws/upgrader.go
// Purpose:      JWT-secured WebSocket connection upgrade handler
// Dependencies: github.com/gorilla/websocket, internal/auth,
//               internal/db (via Hub.Store)
// Role:         Implements the security mandate: every WebSocket
//               connection MUST present a valid JWT before the
//               HTTP→WebSocket upgrade occurs. Anonymous raw socket
//               connections are rejected with 401 Unauthorized.
//
//               Authentication flow:
//               1. Extract JWT from ?token= query parameter OR
//                  the Authorization: Bearer header.
//               2. Validate the token via auth.ValidateToken (HS256).
//               3. Look up the user in PostgreSQL to get username.
//               4. ONLY THEN upgrade the connection to WebSocket.
//               5. Create an authenticated Client with identity
//                  from JWT claims (UserID, IsVIP, Shadowbanned).
//               6. Register the Client with the Hub.
//               7. Start ReadPump and WritePump goroutines.
//
//               The token is validated BEFORE the upgrade to prevent
//               wasting server resources on unauthenticated connections.
//               This is registered on the router as:
//                   router.Get("/ws", hub.ServeWS)
// ═══════════════════════════════════════════════════════════════

package ws

import (
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"

	"tryblynx/internal/auth"
)

// wsUpgrader is the gorilla/websocket upgrader configured for
// the TryBlynx platform.
//
// Buffer sizes:
//   - ReadBufferSize:  4096 bytes (WebSocket frame buffer)
//   - WriteBufferSize: 4096 bytes (WebSocket frame buffer)
//
// CheckOrigin: Allows all origins for local development.
// In production, restrict to the frontend domain.
var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true // TODO: restrict in production
	},
}

// ServeWS handles the WebSocket upgrade request with mandatory
// JWT authentication. This method is registered as an HTTP handler
// on the "/ws" route.
//
// Authentication sources (checked in order):
//  1. Query parameter: /ws?token=eyJ...
//  2. Header: Authorization: Bearer eyJ...
//
// If neither source provides a valid token, the request is rejected
// with 401 Unauthorized and the connection is NOT upgraded.
//
// Parameters:
//   - w: HTTP response writer.
//   - r: HTTP request (must be a GET for WebSocket upgrade).
//
// Behavior on success:
//   - Upgrades the connection to WebSocket.
//   - Creates an authenticated Client struct.
//   - Registers the Client with the Hub.
//   - Starts ReadPump and WritePump goroutines.
//
// Behavior on failure:
//   - 401 Unauthorized with JSON error body.
//   - No WebSocket upgrade occurs.
//   - Connection is closed immediately.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	// ── Step 1: Extract JWT ──────────────────────────────────
	// Priority: query parameter > Authorization header
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if tokenStr == "" {
		log.Printf("ws-upgrade: rejected anonymous connection from %s", r.RemoteAddr)
		w.Header().Set("Content-Type", "application/json")
		http.Error(w,
			`{"error":"authentication required: provide JWT via ?token= query parameter or Authorization: Bearer header"}`,
			http.StatusUnauthorized,
		)
		return
	}

	// ── Step 2: Validate JWT BEFORE upgrade ──────────────────
	// This prevents wasting resources (goroutines, file descriptors)
	// on unauthenticated connections.
	claims, err := auth.ValidateToken(h.Config.JWTSecret, tokenStr)
	if err != nil {
		log.Printf("ws-upgrade: token validation failed from %s: %v", r.RemoteAddr, err)
		w.Header().Set("Content-Type", "application/json")
		http.Error(w,
			`{"error":"invalid or expired token"}`,
			http.StatusUnauthorized,
		)
		return
	}

	// ── Step 3: Look up user for username ────────────────────
	user, err := h.Store.GetUserByID(r.Context(), claims.UserID)
	if err != nil || user == nil {
		log.Printf("ws-upgrade: user %s not found in database", claims.UserID)
		w.Header().Set("Content-Type", "application/json")
		http.Error(w,
			`{"error":"user account not found"}`,
			http.StatusUnauthorized,
		)
		return
	}

	// ── Step 4: Upgrade ONLY after successful auth ───────────
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade failure is already logged by gorilla/websocket
		log.Printf("ws-upgrade: upgrade failed for user %s: %v", claims.UserID, err)
		return
	}

	// ── Step 5: Create authenticated Client ──────────────────
	client := &Client{
		Hub:          h,
		Conn:         conn,
		UserID:       claims.UserID,
		Username:     user.Username,
		IsVIP:        claims.IsVIP,
		Shadowbanned: claims.Shadowbanned,
		Send:         make(chan []byte, sendChannelSize),
		joinedRooms:  make(map[string]bool),
	}

	// ── Step 6: Register with Hub ────────────────────────────
	h.register <- client

	// ── Step 7: Start pumps ──────────────────────────────────
	// WritePump runs in a new goroutine; ReadPump blocks in
	// its own goroutine (started below).
	go client.WritePump()
	go client.ReadPump()

	log.Printf("ws-upgrade: ✓ user %s (%s) connected [VIP: %v, SB: %v]",
		claims.UserID, user.Username, claims.IsVIP, claims.Shadowbanned)
}
