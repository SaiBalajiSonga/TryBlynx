// ═══════════════════════════════════════════════════════════════
// File:         internal/ws/client.go
// Purpose:      Per-connection WebSocket client with read/write
//               pumps and exact-duplicate text filter
// Dependencies: github.com/gorilla/websocket, github.com/google/uuid
// Role:         Each authenticated WebSocket connection is wrapped
//               in a Client struct. Two goroutines manage the
//               connection lifecycle:
//
//               ReadPump:  Reads JSON messages from the WebSocket,
//                          applies the exact-duplicate text filter,
//                          and dispatches to handlers.
//
//               WritePump: Drains the Send channel to the WebSocket
//                          and manages ping/pong keep-alive.
//
//               The exact-duplicate text filter retains the body of
//               the last sent text message (chat.message or dm.message).
//               If a new message has an identical body, it is silently
//               dropped. This prevents automated copy-paste spam
//               without rate-limiting fluid conversation.
//
//               On disconnect, the ReadPump cleans up:
//               1. Removes the user's matchmaking ticket from Redis
//               2. Sends unregister signal to the Hub
//               3. Closes the WebSocket connection
// ═══════════════════════════════════════════════════════════════

package ws

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const (
	// writeWait is the maximum time allowed for writing a message
	// to the WebSocket before the connection is considered dead.
	writeWait = 10 * time.Second

	// pongWait is the maximum time to wait for a pong response
	// from the client. If exceeded, the connection is closed.
	pongWait = 60 * time.Second

	// pingPeriod is the interval between ping messages sent to the
	// client. Must be less than pongWait to detect dead connections
	// before the pong deadline expires (54s < 60s).
	pingPeriod = (pongWait * 9) / 10

	// maxMessageSize is the maximum size (in bytes) of an inbound
	// WebSocket message. Set to 16KB to accommodate 5000-character
	// messages with JSON envelope and multi-byte UTF-8 characters.
	maxMessageSize = 16384

	// sendChannelSize is the buffer capacity of the outbound
	// message channel. Sized for burst tolerance at scale.
	sendChannelSize = 256
)

// ──────────────────────────────────────────────────────────────
// Client
// ──────────────────────────────────────────────────────────────

// Client represents a single authenticated WebSocket connection.
// Each Client is owned by a user and managed by the Hub.
//
// Fields populated from JWT claims at connection time:
//   - UserID:       The authenticated user's UUID.
//   - Username:     Display name (for message attribution).
//   - IsVIP:        Whether the user can use premium features.
//   - Shadowbanned: Whether the user is silently quarantined.
//
// Concurrency model:
//   - Send channel: written by Hub goroutine, read by WritePump
//   - joinedRooms:  accessed only from ReadPump goroutine (no lock)
//   - lastMsgBody:  accessed only from ReadPump goroutine (no lock)
type Client struct {
	// Hub is the central coordinator this client is registered with.
	Hub *Hub

	// Conn is the underlying WebSocket connection.
	Conn *websocket.Conn

	// UserID is the authenticated user's UUID (from JWT claims).
	UserID uuid.UUID

	// Username is the user's display name for message attribution.
	Username string

	// IsVIP indicates premium status (from JWT claims).
	IsVIP bool

	// Shadowbanned indicates quarantine status (from JWT claims).
	Shadowbanned bool

	// IsAnonymous indicates this is a guest/ephemeral account (from JWT claims).
	// Used to gate DMs, friend requests, and other social features without a DB hit.
	IsAnonymous bool

	// Send is the outbound message channel. The Hub writes
	// serialized JSON messages here; WritePump drains them to
	// the WebSocket. Closing this channel signals WritePump to exit.
	Send chan []byte

	// lastMsgBody stores the exact text of the last sent message
	// for the duplicate text filter. Accessed ONLY from the
	// ReadPump goroutine — no synchronization needed.
	lastMsgBody string

	// lastMsgAt is the time the last text message was sent.
	// Used to restrict the duplicate filter to a short burst window
	// so legitimate repeated questions (sent >500 ms apart) are allowed.
	lastMsgAt time.Time

	// joinedRooms tracks the Redis channel keys of rooms this
	// client has joined. Accessed ONLY from the ReadPump
	// goroutine — no synchronization needed.
	joinedRooms map[string]bool
}

// ──────────────────────────────────────────────────────────────
// ReadPump
// ──────────────────────────────────────────────────────────────

// ReadPump reads messages from the WebSocket connection in a loop,
// applies the exact-duplicate text filter, and dispatches valid
// messages to the handler router.
//
// This method runs in its own goroutine (started by ServeWS).
// It blocks until the connection is closed or an error occurs.
//
// On exit, it:
//  1. Removes any pending matchmaking ticket from Redis.
//  2. Sends an unregister signal to the Hub.
//  3. Closes the WebSocket connection.
//
// The exact-duplicate text filter works as follows:
//   - For message types "chat.message" and "dm.message", the body
//     field is extracted from the payload.
//   - If the body exactly matches the previous message's body,
//     the message is silently dropped (no error sent to client).
//   - If the body is different, it is stored as the new baseline.
//   - This prevents automated copy-paste spam while allowing
//     natural conversation repetition after intervening messages.
func (c *Client) ReadPump() {
	defer func() {
		// ── Cleanup on disconnect ────────────────────────────
		// 1. Remove matchmaking ticket (if queued)
		c.cleanupMatchTicket()

		// 1b. Remove from Redis presence for all joined rooms
		for roomKey := range c.joinedRooms {
			// Extract UUID from "chat:room:<uuid>"
			if len(roomKey) > 10 {
				roomID := roomKey[10:]
				c.Hub.Store.RemoveRoomPresence(context.Background(), roomID, c.UserID)
			}
		}

		// 2. Unregister from Hub (triggers room cleanup)
		c.Hub.unregister <- c

		// 3. Close the WebSocket connection
		c.Conn.Close()

		log.Printf("ws-client: ReadPump exited for user %s", c.UserID)
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, rawMsg, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseNormalClosure,
				websocket.CloseNoStatusReceived,
			) {
				log.Printf("ws-client: unexpected close for user %s: %v", c.UserID, err)
			}
			break
		}

		// Extend deadline on any inbound message activity
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))

		// ── Parse message envelope ───────────────────────────
		var msg InboundMessage
		if err := json.Unmarshal(rawMsg, &msg); err != nil {
			c.sendError("invalid message format: expected JSON with 'type' and 'payload' fields")
			continue
		}
		if msg.Type == "" {
			c.sendError("missing 'type' field in message")
			continue
		}

		// ── Exact-Duplicate Text Filter ──────────────────────
		// Only applied to message types that carry user-authored text.
		// The filter only fires within a 500 ms burst window so that
		// legitimate repeated questions sent after a pause are allowed.
		if isTextMessage(msg.Type) {
			body := extractBody(msg.Payload)
			now := time.Now()
			if body != "" && body == c.lastMsgBody && now.Sub(c.lastMsgAt) < 500*time.Millisecond {
				// Silently drop: identical body within burst window.
				// No error sent — the client sees no feedback,
				// making automated spam tools ineffective.
				continue
			}
			if body != "" {
				c.lastMsgBody = body
				c.lastMsgAt = now
			}
		}

		// ── Dispatch to handler ──────────────────────────────
		handleMessage(c, &msg)
	}
}

// ──────────────────────────────────────────────────────────────
// WritePump
// ──────────────────────────────────────────────────────────────

// WritePump drains the Send channel and writes messages to the
// WebSocket connection. It also sends periodic ping frames to
// detect dead connections.
//
// This method runs in its own goroutine (started by ServeWS).
// It exits when the Send channel is closed (by the Hub on
// unregister) or when a write error occurs.
//
// Each message in the Send channel is written as a single
// WebSocket text frame (no batching) to ensure the client
// receives each JSON message as an independent frame.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
		log.Printf("ws-client: WritePump exited for user %s", c.UserID)
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))

			if !ok {
				// Hub closed the channel → send WebSocket close frame
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Write each message as an individual text frame
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			// Send ping to detect dead connections
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ──────────────────────────────────────────────────────────────
// Helper Methods
// ──────────────────────────────────────────────────────────────

// sendJSON marshals the given value to JSON and queues it on the
// Send channel. Non-blocking: drops the message if the channel
// buffer is full (the client is too slow).
//
// Parameters:
//   - data: Any JSON-serializable value.
func (c *Client) sendJSON(data interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("ws-client: JSON marshal failed for user %s: %v", c.UserID, err)
		return
	}

	select {
	case c.Send <- jsonData:
	default:
		log.Printf("ws-client: send buffer full for user %s, dropping message", c.UserID)
	}
}

// sendError sends a typed error message to the client.
//
// Parameters:
//   - message: Human-readable error description.
func (c *Client) sendError(message string) {
	c.sendJSON(OutboundMessage{
		Type:    "error",
		Payload: map[string]string{"message": message},
	})
}

// cleanupMatchTicket removes the user's matchmaking ticket from
// Redis on disconnect. Uses a fire-and-forget pattern since we're
// in a cleanup path.
func (c *Client) cleanupMatchTicket() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	pipe := c.Hub.RDB.Pipeline()
	pipe.ZRem(ctx, "waiting_pool", c.UserID.String())
	pipe.Del(ctx, "ticket:"+c.UserID.String())
	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("ws-client: failed to cleanup match ticket for user %s: %v", c.UserID, err)
	}
}
