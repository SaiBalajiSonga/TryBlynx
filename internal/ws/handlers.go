// ═══════════════════════════════════════════════════════════════
// File:         internal/ws/handlers.go
// Purpose:      WebSocket message routing and per-type handler
//               functions for all real-time operations
// Dependencies: github.com/google/uuid, github.com/redis/go-redis/v9,
//               internal/db (via Hub.Store)
// Role:         Receives parsed InboundMessage structs from the
//               Client's ReadPump and dispatches them to the correct
//               handler based on the "type" field. Each handler
//               runs in the Client's ReadPump goroutine, meaning:
//               - DB operations are per-client (don't block the Hub)
//               - Hub mutations go through Hub channels
//               - Redis operations are direct (pooled client)
//
//               Supported message types:
//               ┌─────────────────┬────────────────────────────────┐
//               │ Type             │ Handler                        │
//               ├─────────────────┼────────────────────────────────┤
//               │ chat.join        │ Join a chat room               │
//               │ chat.message     │ Send message to a room         │
//               │ chat.leave       │ Leave a chat room              │
//               │ dm.message       │ Send a direct message          │
//               │ match.find       │ Submit matchmaking ticket       │
//               │ match.cancel     │ Cancel matchmaking             │
//               │ webrtc.offer     │ Relay SDP offer to peer        │
//               │ webrtc.answer    │ Relay SDP answer to peer       │
//               │ webrtc.ice       │ Relay ICE candidate to peer    │
//               └─────────────────┴────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════

package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// ──────────────────────────────────────────────────────────────
// Message Envelope Types
// ──────────────────────────────────────────────────────────────

// InboundMessage is the standard envelope for all client→server
// WebSocket messages. The Type field determines which handler
// processes the Payload.
type InboundMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// OutboundMessage is the standard envelope for all server→client
// WebSocket messages. The Payload is marshaled to JSON by
// Client.sendJSON.
type OutboundMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// ──────────────────────────────────────────────────────────────
// Duplicate Filter Helpers
// ──────────────────────────────────────────────────────────────

// isTextMessage returns true for message types that carry user-
// authored text and should be checked by the duplicate filter.
func isTextMessage(msgType string) bool {
	return msgType == "chat.message" || msgType == "dm.message"
}

// extractBody performs a lightweight extraction of the "body"
// field from a JSON payload. Used by the duplicate filter in
// ReadPump before full handler dispatch.
//
// Parameters:
//   - payload: Raw JSON payload from the inbound message.
//
// Returns:
//   - string: The body text, or "" if not present or parse fails.
func extractBody(payload json.RawMessage) string {
	var p struct {
		Body string `json:"body"`
	}
	json.Unmarshal(payload, &p)
	return p.Body
}

// ──────────────────────────────────────────────────────────────
// Message Dispatcher
// ──────────────────────────────────────────────────────────────

// handleMessage routes an inbound WebSocket message to the
// appropriate handler function based on its type.
//
// This function runs in the Client's ReadPump goroutine.
// Unknown message types receive an error response.
//
// Parameters:
//   - c:   The authenticated client that sent the message.
//   - msg: The parsed inbound message with type and payload.
func handleMessage(c *Client, msg *InboundMessage) {
	switch msg.Type {
	// ── Chat Room ────────────────────────────────────────
	case "chat.join":
		handleChatJoin(c, msg.Payload)
	case "chat.message":
		handleChatMessage(c, msg.Payload)
	case "chat.leave":
		handleChatLeave(c, msg.Payload)

	// ── Direct Messages ──────────────────────────────────
	case "dm.message":
		handleDMMessage(c, msg.Payload)

	// ── Matchmaking ──────────────────────────────────────
	case "match.find":
		handleMatchFind(c, msg.Payload)
	case "match.cancel":
		handleMatchCancel(c, msg.Payload)

	// ── WebRTC Signaling ─────────────────────────────────
	case "webrtc.offer", "webrtc.answer", "webrtc.ice":
		handleWebRTCSignal(c, msg.Type, msg.Payload)

	default:
		c.sendError(fmt.Sprintf("unknown message type: %q", msg.Type))
	}
}

// ══════════════════════════════════════════════════════════════
// PAYLOAD TYPES
// ══════════════════════════════════════════════════════════════

type chatJoinPayload struct {
	RoomID string `json:"room_id"` // Conversation UUID
}

type chatMessagePayload struct {
	RoomID string `json:"room_id"` // Conversation UUID
	Body   string `json:"body"`    // 1-5000 characters
}

type chatLeavePayload struct {
	RoomID string `json:"room_id"` // Conversation UUID
}

type dmMessagePayload struct {
	RecipientID string `json:"recipient_id"` // Target user UUID
	Body        string `json:"body"`         // 1-5000 characters
}

type matchFindPayload struct {
	TargetGender string `json:"target_gender"` // "male","female","any"
}

type webrtcSignalPayload struct {
	PeerID    string          `json:"peer_id"`              // Target peer UUID
	SDP       json.RawMessage `json:"sdp,omitempty"`        // Session Description
	Candidate json.RawMessage `json:"candidate,omitempty"`  // ICE Candidate
}

// ══════════════════════════════════════════════════════════════
// CHAT ROOM HANDLERS
// ══════════════════════════════════════════════════════════════

// handleChatJoin processes "chat.join" messages.
//
// Verifies the user is a member of the conversation in PostgreSQL,
// then registers them in the Hub's room and subscribes to the
// Redis Pub/Sub channel. The room key follows the format
// "chat:room:{conversationUUID}".
//
// Inbound: {"type":"chat.join","payload":{"room_id":"<uuid>"}}
// Outbound: {"type":"chat.joined","payload":{"room_id":"...","status":"joined"}}
func handleChatJoin(c *Client, payload json.RawMessage) {
	var p chatJoinPayload
	if err := json.Unmarshal(payload, &p); err != nil || p.RoomID == "" {
		c.sendError("invalid chat.join payload: room_id is required")
		return
	}

	// Validate room_id is a valid UUID (conversation ID)
	convID, err := uuid.Parse(p.RoomID)
	if err != nil {
		c.sendError("invalid room_id: must be a valid UUID (conversation ID)")
		return
	}

	// Auto-join if it's a public group, or verify membership for DMs
	isMember, err := c.Hub.Store.CheckPublicGroupAccess(context.Background(), convID, c.UserID)
	if err != nil {
		log.Printf("ws-handler: DB error checking/auto-joining room for user %s in room %s: %v",
			c.UserID, p.RoomID, err)
		c.sendError("failed to verify room membership")
		return
	}
	if !isMember {
		c.sendError("you are not a member of this conversation")
		return
	}

	// Build Redis channel key
	roomKey := "chat:room:" + p.RoomID

	// Request the Hub to register this client in the room
	// (synchronous via Done channel to ensure room is ready
	// before we return to the ReadPump)
	done := make(chan struct{})
	c.Hub.joinRoom <- &RoomRequest{Client: c, RoomID: roomKey, Done: done}
	<-done

	// Track locally for fast membership checks in chat.message
	c.joinedRooms[roomKey] = true

	// Add to Redis live presence tracking
	if err := c.Hub.Store.AddRoomPresence(context.Background(), p.RoomID, c.UserID); err != nil {
		log.Printf("ws-handler: failed to add room presence: %v", err)
	}

	c.sendJSON(OutboundMessage{
		Type: "chat.joined",
		Payload: map[string]string{
			"room_id": p.RoomID,
			"status":  "joined",
		},
	})
}

// handleChatMessage processes "chat.message" messages.
//
// Validates the client has joined the target room (local check),
// persists the message to PostgreSQL, and publishes the outbound
// message to Redis for fan-out to all room members.
//
// Inbound:  {"type":"chat.message","payload":{"room_id":"<uuid>","body":"Hello!"}}
// Outbound: {"type":"chat.message","payload":{"message_id":"...","sender_id":"...","sender_name":"...","room_id":"...","body":"...","created_at":"..."}}
func handleChatMessage(c *Client, payload json.RawMessage) {
	var p chatMessagePayload
	if err := json.Unmarshal(payload, &p); err != nil || p.RoomID == "" || p.Body == "" {
		c.sendError("invalid chat.message payload: room_id and body are required")
		return
	}
	if len(p.Body) > 5000 {
		c.sendError("message too long (max 5000 characters)")
		return
	}

	roomKey := "chat:room:" + p.RoomID

	// Fast local membership check (avoids DB round-trip)
	if !c.joinedRooms[roomKey] {
		c.sendError("you must join the room before sending messages (send chat.join first)")
		return
	}

	// Persist message to PostgreSQL
	convID, _ := uuid.Parse(p.RoomID) // Already validated on join
	msg, err := c.Hub.Store.CreateMessage(context.Background(), convID, c.UserID, p.Body)
	if err != nil {
		log.Printf("ws-handler: failed to persist chat message for user %s: %v", c.UserID, err)
		c.sendError("failed to send message")
		return
	}

	// Build outbound message with full metadata
	outbound := OutboundMessage{
		Type: "chat.message",
		Payload: map[string]interface{}{
			"message_id":  msg.ID.String(),
			"sender_id":   c.UserID.String(),
			"sender_name": c.Username,
			"room_id":     p.RoomID,
			"body":        msg.Body,
			"created_at":  msg.CreatedAt.Format(time.RFC3339Nano),
		},
	}
	outData, _ := json.Marshal(outbound)

	// Publish to Redis → Hub receives via listenRedis → fans
	// out to all local clients in the room (including sender)
	c.Hub.broadcast <- &RoomBroadcast{RoomID: roomKey, Data: outData}
}

// handleChatLeave processes "chat.leave" messages.
//
// Removes the client from the room in the Hub and the local
// joinedRooms set. If this was the last client in the room,
// the Hub unsubscribes from the Redis channel.
//
// Inbound:  {"type":"chat.leave","payload":{"room_id":"<uuid>"}}
// Outbound: {"type":"chat.left","payload":{"room_id":"...","status":"left"}}
func handleChatLeave(c *Client, payload json.RawMessage) {
	var p chatLeavePayload
	if err := json.Unmarshal(payload, &p); err != nil || p.RoomID == "" {
		c.sendError("invalid chat.leave payload: room_id is required")
		return
	}

	roomKey := "chat:room:" + p.RoomID

	if !c.joinedRooms[roomKey] {
		return // Not in room — nothing to do (idempotent)
	}

	// Request Hub to remove this client from the room
	done := make(chan struct{})
	c.Hub.leaveRoom <- &RoomRequest{Client: c, RoomID: roomKey, Done: done}
	<-done

	delete(c.joinedRooms, roomKey)

	c.sendJSON(OutboundMessage{
		Type: "chat.left",
		Payload: map[string]string{
			"room_id": p.RoomID,
			"status":  "left",
		},
	})

	// Remove from Redis live presence tracking
	if err := c.Hub.Store.RemoveRoomPresence(context.Background(), p.RoomID, c.UserID); err != nil {
		log.Printf("ws-handler: failed to remove room presence: %v", err)
	}
}

// ══════════════════════════════════════════════════════════════
// DIRECT MESSAGE HANDLER
// ══════════════════════════════════════════════════════════════

// handleDMMessage processes "dm.message" messages.
//
// Gets or creates a DM conversation between the sender and
// recipient (using the atomic get_or_create_dm() PostgreSQL
// function), persists the message, sends confirmation to the
// sender, and delivers to the recipient via the Hub's direct
// channel (if online).
//
// If the recipient is offline, the message is still persisted
// and will appear in their DM history when they next connect.
//
// Inbound:  {"type":"dm.message","payload":{"recipient_id":"<uuid>","body":"Hi!"}}
// Outbound: {"type":"dm.message","payload":{"message_id":"...","conversation_id":"...","sender_id":"...","sender_name":"...","body":"...","created_at":"..."}}
func handleDMMessage(c *Client, payload json.RawMessage) {
	var p dmMessagePayload
	if err := json.Unmarshal(payload, &p); err != nil || p.RecipientID == "" || p.Body == "" {
		c.sendError("invalid dm.message payload: recipient_id and body are required")
		return
	}
	if len(p.Body) > 5000 {
		c.sendError("message too long (max 5000 characters)")
		return
	}

	recipientID, err := uuid.Parse(p.RecipientID)
	if err != nil {
		c.sendError("invalid recipient_id: must be a valid UUID")
		return
	}
	if recipientID == c.UserID {
		c.sendError("cannot send a DM to yourself")
		return
	}

	ctx := context.Background()

	// Get or create DM conversation atomically
	convID, err := c.Hub.Store.GetOrCreateDM(ctx, c.UserID, recipientID)
	if err != nil {
		log.Printf("ws-handler: failed to get/create DM for %s→%s: %v",
			c.UserID, recipientID, err)
		c.sendError("failed to initialize conversation")
		return
	}

	// Persist message to PostgreSQL
	msg, err := c.Hub.Store.CreateMessage(ctx, convID, c.UserID, p.Body)
	if err != nil {
		log.Printf("ws-handler: failed to persist DM for user %s: %v", c.UserID, err)
		c.sendError("failed to send message")
		return
	}

	// Build outbound message
	outbound := OutboundMessage{
		Type: "dm.message",
		Payload: map[string]interface{}{
			"message_id":      msg.ID.String(),
			"conversation_id": convID.String(),
			"sender_id":       c.UserID.String(),
			"sender_name":     c.Username,
			"body":            msg.Body,
			"created_at":      msg.CreatedAt.Format(time.RFC3339Nano),
		},
	}
	outData, _ := json.Marshal(outbound)

	// Send confirmation to the sender
	select {
	case c.Send <- outData:
	default:
		log.Printf("ws-handler: DM confirmation dropped for slow sender %s", c.UserID)
	}

	// Deliver to recipient (if online — otherwise they'll see
	// it in their DM history via the REST API)
	c.Hub.direct <- &DirectMessage{TargetUserID: recipientID, Data: outData}
}

// ══════════════════════════════════════════════════════════════
// MATCHMAKING HANDLERS
// ══════════════════════════════════════════════════════════════

// handleMatchFind processes "match.find" messages.
//
// Fetches the user's full profile from PostgreSQL (for matchmaking
// attributes), then submits a ticket to the Redis waiting pool:
//   - ZADD waiting_pool <timestamp> <userID>
//   - HSET ticket:<userID> {gender, target_gender, location, ...}
//
// The target_gender filter is a VIP-only feature. Non-VIP users
// always match with any gender.
//
// The actual matching is performed by the Matchmaker Worker
// (Stream D) which processes the waiting pool in batches.
//
// Inbound:  {"type":"match.find","payload":{"target_gender":"any"}}
// Outbound: {"type":"match.queued","payload":{"status":"waiting","target_gender":"..."}}
func handleMatchFind(c *Client, payload json.RawMessage) {
	var p matchFindPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		c.sendError("invalid match.find payload")
		return
	}

	// Gender filter is VIP-only: non-VIP always gets "any"
	targetGender := "any"
	if c.IsVIP && p.TargetGender != "" {
		targetGender = p.TargetGender
	}

	// Fetch full user profile for matchmaking attributes
	user, err := c.Hub.Store.GetUserByID(context.Background(), c.UserID)
	if err != nil || user == nil {
		c.sendError("failed to load user profile for matchmaking")
		return
	}

	// Build ticket data for Redis
	now := time.Now()
	score := float64(now.UnixMilli())

	interestsJSON, _ := json.Marshal(user.Interests)

	ticketData := map[string]interface{}{
		"user_id":       c.UserID.String(),
		"gender":        user.Gender,
		"target_gender": targetGender,
		"location":      user.Location,
		"language":      user.Language,
		"interests":     string(interestsJSON),
		"is_vip":        formatBool(user.IsVIP),
		"shadowbanned":  formatBool(user.Shadowbanned),
		"submitted_at":  now.Format(time.RFC3339Nano),
	}

	// Atomic ticket submission: ZADD + HSET in a pipeline
	ctx := context.Background()
	pipe := c.Hub.RDB.Pipeline()
	pipe.ZAdd(ctx, "waiting_pool", redis.Z{Score: score, Member: c.UserID.String()})
	pipe.HSet(ctx, "ticket:"+c.UserID.String(), ticketData)
	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("ws-handler: failed to submit match ticket for user %s: %v", c.UserID, err)
		c.sendError("failed to submit matchmaking request")
		return
	}

	c.sendJSON(OutboundMessage{
		Type: "match.queued",
		Payload: map[string]string{
			"status":        "waiting",
			"target_gender": targetGender,
		},
	})

	log.Printf("ws-handler: user %s submitted match ticket (gender=%s, target=%s, loc=%s, lang=%s)",
		c.UserID, user.Gender, targetGender, user.Location, user.Language)
}

// handleMatchCancel processes "match.cancel" messages.
//
// Removes the user's ticket from the Redis waiting pool and
// deletes the ticket hash. Idempotent: safe to call even if
// no ticket exists.
//
// Inbound:  {"type":"match.cancel","payload":{}}
// Outbound: {"type":"match.cancelled","payload":{"status":"cancelled"}}
func handleMatchCancel(c *Client, _ json.RawMessage) {
	ctx := context.Background()
	pipe := c.Hub.RDB.Pipeline()
	pipe.ZRem(ctx, "waiting_pool", c.UserID.String())
	pipe.Del(ctx, "ticket:"+c.UserID.String())
	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("ws-handler: failed to cancel match ticket for user %s: %v", c.UserID, err)
		c.sendError("failed to cancel matchmaking")
		return
	}

	c.sendJSON(OutboundMessage{
		Type:    "match.cancelled",
		Payload: map[string]string{"status": "cancelled"},
	})

	log.Printf("ws-handler: user %s cancelled matchmaking", c.UserID)
}

// ══════════════════════════════════════════════════════════════
// WEBRTC SIGNALING HANDLERS
// ══════════════════════════════════════════════════════════════

// handleWebRTCSignal processes "webrtc.offer", "webrtc.answer",
// and "webrtc.ice" messages.
//
// Relays the signaling data to the target peer via the Hub's
// direct channel. The sender's ID is attached so the peer knows
// who the signal came from.
//
// WebRTC signaling flow:
//  1. User A sends webrtc.offer to User B
//  2. Server relays offer to B (with A's peer_id)
//  3. User B sends webrtc.answer to User A
//  4. Server relays answer to A (with B's peer_id)
//  5. Both exchange webrtc.ice candidates via server relay
//  6. Once ICE completes, media flows directly (P2P)
//
// Inbound:  {"type":"webrtc.offer","payload":{"peer_id":"<uuid>","sdp":{...}}}
// Outbound: {"type":"webrtc.offer","payload":{"peer_id":"<sender_uuid>","sdp":{...}}}
func handleWebRTCSignal(c *Client, msgType string, payload json.RawMessage) {
	var p webrtcSignalPayload
	if err := json.Unmarshal(payload, &p); err != nil || p.PeerID == "" {
		c.sendError("invalid WebRTC signal payload: peer_id is required")
		return
	}

	peerID, err := uuid.Parse(p.PeerID)
	if err != nil {
		c.sendError("invalid peer_id: must be a valid UUID")
		return
	}

	if peerID == c.UserID {
		c.sendError("cannot send WebRTC signal to yourself")
		return
	}

	// Relay the signal to the peer with the sender's ID attached
	// so the peer knows who the signal is from
	outbound := OutboundMessage{
		Type: msgType,
		Payload: map[string]interface{}{
			"peer_id":   c.UserID.String(), // Sender's ID (not original peer_id)
			"sdp":       p.SDP,
			"candidate": p.Candidate,
		},
	}
	outData, _ := json.Marshal(outbound)

	c.Hub.direct <- &DirectMessage{TargetUserID: peerID, Data: outData}
}

// ══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════

// formatBool converts a boolean to a Redis-friendly string.
func formatBool(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
