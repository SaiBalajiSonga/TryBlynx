// ═══════════════════════════════════════════════════════════════
// File:         internal/ws/hub.go
// Purpose:      Concurrency-safe central Hub for WebSocket client
//               management and real-time message routing
// Dependencies: github.com/redis/go-redis/v9, github.com/google/uuid,
//               internal/config, internal/db
// Role:         The Hub is the single coordination point for all
//               WebSocket connections. It maintains:
//               - A registry of connected clients (one per user)
//               - Room membership maps for group/random chats
//               - Redis Pub/Sub integration for horizontal scaling
//
//               ALL state mutations happen inside the Run() goroutine
//               via channel-based communication. No mutexes are needed
//               because only the Run goroutine reads/writes the maps.
//               External goroutines (ReadPump, handlers, matchmaker)
//               interact exclusively through typed channels.
//
//               Redis Pub/Sub flow:
//               1. Client sends chat.message → handler publishes
//                  to Redis via the broadcast channel
//               2. Hub publishes to Redis channel "chat:room:{id}"
//               3. Redis fans the message back to all subscribers
//                  (including this instance)
//               4. listenRedis goroutine forwards to redisMsgs channel
//               5. Hub fans out to all local clients in that room
// ═══════════════════════════════════════════════════════════════

package ws

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"tryblynx/internal/config"
	"tryblynx/internal/db"
)

// Channel buffer sizes tuned for 10K-20K concurrent connections.
// Large buffers prevent the Hub goroutine from becoming a bottleneck
// under burst traffic. Each buffer entry is a small struct/pointer.
const (
	registerBufSize   = 256
	unregisterBufSize = 256
	roomReqBufSize    = 512
	broadcastBufSize  = 2048
	directBufSize     = 2048
	redisMsgBufSize   = 4096
)

// ──────────────────────────────────────────────────────────────
// Channel Message Types
// ──────────────────────────────────────────────────────────────

// RoomRequest encapsulates a request for a client to join or
// leave a chat room. The Done channel is closed by the Hub after
// the operation completes, allowing the caller to synchronize.
type RoomRequest struct {
	Client *Client
	RoomID string
	Done   chan struct{}
}

// RoomBroadcast carries a serialized message to be published to
// a chat room via Redis Pub/Sub for fan-out.
type RoomBroadcast struct {
	RoomID string
	Data   []byte
}

// DirectMessage carries a serialized message to be delivered to
// a specific user by UUID. Used for DMs, match notifications,
// and WebRTC signaling relay.
type DirectMessage struct {
	TargetUserID uuid.UUID
	Data         []byte
}

// ──────────────────────────────────────────────────────────────
// Hub
// ──────────────────────────────────────────────────────────────

// Hub maintains the set of active WebSocket clients and coordinates
// all real-time message routing through channel-based communication.
//
// Thread safety: All map state (clients, rooms) is accessed ONLY
// from the Run() goroutine. External code communicates via channels.
// The exported SendToUser method is safe for concurrent use.
type Hub struct {
	// ── Dependencies (injected, read-only after construction) ─
	// Store provides database access for message persistence.
	Store *db.Store
	// RDB is the Redis client for Pub/Sub and matchmaker state.
	RDB *redis.Client
	// Config holds application configuration (JWT secret, etc.)
	Config *config.Config

	// ── State (accessed ONLY from the Run goroutine) ─────────
	// clients maps each user's UUID to ALL their active WebSocket
	// connections. Multiple tabs/devices per user are supported;
	// each connection is tracked independently.
	clients map[uuid.UUID]map[*Client]bool

	// rooms maps Redis channel keys ("chat:room:{id}") to the
	// set of local clients subscribed to that room.
	rooms map[string]map[*Client]bool

	// ── Channels (thread-safe inbound communication) ─────────
	register   chan *Client
	unregister chan *Client
	joinRoom   chan *RoomRequest
	leaveRoom  chan *RoomRequest
	broadcast  chan *RoomBroadcast
	direct     chan *DirectMessage

	// ── Redis Pub/Sub ────────────────────────────────────────
	pubsub    *redis.PubSub
	redisMsgs chan *redis.Message

	// ── Lifecycle ────────────────────────────────────────────
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// presenceMu guards presenceDebounce — written from broadcastPresenceUpdate
	// goroutines, which run off the Hub event loop.
	presenceMu      sync.Mutex
	presenceDebounce map[uuid.UUID]context.CancelFunc
}

// NewHub creates a new Hub with all dependencies wired and
// channels initialized. Call Run() in a dedicated goroutine
// after construction.
//
// Parameters:
//   - store: Database access layer for message persistence.
//   - rdb:   Redis client for Pub/Sub and matchmaker state.
//   - cfg:   Application configuration.
//
// Returns:
//   - *Hub: Ready to start via hub.Run().
func NewHub(store *db.Store, rdb *redis.Client, cfg *config.Config) *Hub {
	ctx, cancel := context.WithCancel(context.Background())

	h := &Hub{
		Store:  store,
		RDB:    rdb,
		Config: cfg,

		clients: make(map[uuid.UUID]map[*Client]bool),
		rooms:   make(map[string]map[*Client]bool),

		register:   make(chan *Client, registerBufSize),
		unregister: make(chan *Client, unregisterBufSize),
		joinRoom:   make(chan *RoomRequest, roomReqBufSize),
		leaveRoom:  make(chan *RoomRequest, roomReqBufSize),
		broadcast:  make(chan *RoomBroadcast, broadcastBufSize),
		direct:     make(chan *DirectMessage, directBufSize),
		redisMsgs:  make(chan *redis.Message, redisMsgBufSize),

		ctx:    ctx,
		cancel: cancel,

		presenceDebounce: make(map[uuid.UUID]context.CancelFunc),
	}

	// Initialize Redis PubSub (no channels subscribed yet;
	// channels are added dynamically as clients join rooms)
	h.pubsub = rdb.Subscribe(ctx)

	return h
}

// Run starts the Hub's main event loop. This method blocks and
// must be called in a dedicated goroutine:
//
//	go hub.Run()
//
// The loop processes all channel communications sequentially,
// ensuring thread-safe access to the clients and rooms maps
// without any mutexes.
func (h *Hub) Run() {
	// Start the Redis subscription listener in a background goroutine
	h.wg.Add(1)
	go h.listenRedis()

	log.Println("ws-hub: event loop started")

	for {
		select {
		case <-h.ctx.Done():
			log.Println("ws-hub: context cancelled, stopping event loop")
			return

		case client := <-h.register:
			h.handleRegister(client)

		case client := <-h.unregister:
			h.handleUnregister(client)

		case req := <-h.joinRoom:
			h.handleJoinRoom(req)

		case req := <-h.leaveRoom:
			h.handleLeaveRoom(req)

		case msg := <-h.broadcast:
			// Publish to Redis Pub/Sub for fan-out across all
			// instances (including this one via listenRedis)
			if err := h.RDB.Publish(h.ctx, msg.RoomID, msg.Data).Err(); err != nil {
				log.Printf("ws-hub: Redis PUBLISH to %s failed: %v", msg.RoomID, err)
			}

		case msg := <-h.direct:
			h.handleDirect(msg)

		case redisMsg := <-h.redisMsgs:
			h.handleRedisMessage(redisMsg)
		}
	}
}

// Shutdown gracefully stops the Hub, closing the Redis subscription
// and waiting for the listener goroutine to exit.
//
// Client connections are not explicitly closed here; they will be
// terminated when the HTTP server shuts down.
func (h *Hub) Shutdown() {
	h.cancel()
	if h.pubsub != nil {
		h.pubsub.Close()
	}
	h.wg.Wait()
	log.Println("ws-hub: shutdown complete")
}

// SendToUser delivers a message to a specific user by UUID.
// This is the public API used by the matchmaker (Stream D) to
// notify users of match results. Thread-safe: communicates
// through the direct channel.
//
// If the user is not connected, the message is silently dropped
// (it should already be persisted in the database by the caller).
//
// Parameters:
//   - userID: Target user's UUID.
//   - data:   Serialized JSON message bytes.
func (h *Hub) SendToUser(userID uuid.UUID, data []byte) {
	select {
	case h.direct <- &DirectMessage{TargetUserID: userID, Data: data}:
	case <-h.ctx.Done():
	}
}

// ══════════════════════════════════════════════════════════════
// Internal Event Handlers (run ONLY inside the Run goroutine)
// ══════════════════════════════════════════════════════════════

// handleRegister adds a client to the registry. Multiple connections
// per user (e.g. multiple tabs or devices) are fully supported.
// Each connection is tracked independently in a per-user set.
func (h *Hub) handleRegister(client *Client) {
	if h.clients[client.UserID] == nil {
		h.clients[client.UserID] = make(map[*Client]bool)
	}
	h.clients[client.UserID][client] = true

	// Increment global presence count
	wentOnline, err := h.Store.AddGlobalPresence(context.Background(), client.UserID)
	if err != nil {
		log.Printf("ws-hub: failed to add global presence: %v", err)
	}

	if wentOnline {
		// Broadcast to friends that user went online
		h.broadcastPresenceUpdate(client.UserID, true)
	}

	total := 0
	for _, conns := range h.clients {
		total += len(conns)
	}
	log.Printf("ws-hub: registered user %s [conns for user: %d, total: %d]",
		client.UserID, len(h.clients[client.UserID]), total)
}

// handleUnregister removes a specific client connection from the registry.
// If it was the user's last connection, the user entry is cleaned up entirely.
func (h *Hub) handleUnregister(client *Client) {
	conns, ok := h.clients[client.UserID]
	if !ok {
		return
	}
	if _, exists := conns[client]; !exists {
		return
	}

	h.removeClientFromAllRooms(client)
	delete(conns, client)
	close(client.Send)

	if len(conns) == 0 {
		delete(h.clients, client.UserID)

		// Decrement global presence count
		wentOffline, err := h.Store.RemoveGlobalPresence(context.Background(), client.UserID)
		if err != nil {
			log.Printf("ws-hub: failed to remove global presence: %v", err)
		}

		if wentOffline {
			// Update last active in DB
			_ = h.Store.UpdateLastActive(context.Background(), client.UserID)

			// Broadcast to friends that user went offline
			h.broadcastPresenceUpdate(client.UserID, false)
		}
	}

	total := 0
	for _, c := range h.clients {
		total += len(c)
	}
	log.Printf("ws-hub: unregistered client for user %s [remaining conns: %d, total: %d]",
		client.UserID, len(h.clients[client.UserID]), total)
}

// broadcastPresenceUpdate sends a presence WS event to all connected friends of a user.
// Runs in its own goroutine — never blocks Hub.Run().
//
// Debouncing: on rapid connect/disconnect (network flap), multiple calls would
// otherwise spawn concurrent goroutines each querying GetFriends and fanning out
// to N friends. We cancel the previous in-flight goroutine for the same user
// before launching a new one so only the latest state wins.
func (h *Hub) broadcastPresenceUpdate(userID uuid.UUID, online bool) {
	h.presenceMu.Lock()
	if cancel, ok := h.presenceDebounce[userID]; ok {
		cancel() // cancel previous in-flight goroutine for this user
	}
	ctx, cancel := context.WithCancel(h.ctx)
	h.presenceDebounce[userID] = cancel
	h.presenceMu.Unlock()

	go func() {
		defer func() {
			h.presenceMu.Lock()
			// Only clean up if our cancel fn is still the current one
			if h.presenceDebounce[userID] == cancel {
				delete(h.presenceDebounce, userID)
			}
			h.presenceMu.Unlock()
			cancel()
		}()

		// 500ms debounce window — rapid flaps only fire the last state
		select {
		case <-time.After(500 * time.Millisecond):
		case <-ctx.Done():
			return
		}

		friends, err := h.Store.GetFriends(ctx, userID)
		if err != nil || ctx.Err() != nil {
			return
		}

		payload, _ := json.Marshal(map[string]interface{}{
			"type": "presence.update",
			"payload": map[string]interface{}{
				"user_id":        userID,
				"online":         online,
				"last_active_at": time.Now(),
			},
		})

		for _, f := range friends {
			if ctx.Err() != nil {
				return
			}
			var friendID uuid.UUID
			if f.RequesterID == userID {
				friendID = f.AddresseeID
			} else {
				friendID = f.RequesterID
			}
			h.SendToUser(friendID, payload)
		}
	}()
}

// handleJoinRoom adds a client to a room. If this is the first
// local client in the room, subscribes to the corresponding
// Redis Pub/Sub channel.
func (h *Hub) handleJoinRoom(req *RoomRequest) {
	if h.rooms[req.RoomID] == nil {
		h.rooms[req.RoomID] = make(map[*Client]bool)
		// First local client → subscribe to Redis channel
		if err := h.pubsub.Subscribe(h.ctx, req.RoomID); err != nil {
			log.Printf("ws-hub: Redis SUBSCRIBE %s failed: %v", req.RoomID, err)
		}
	}
	h.rooms[req.RoomID][req.Client] = true

	// Signal the caller that the join is complete
	if req.Done != nil {
		close(req.Done)
	}

	log.Printf("ws-hub: user %s joined room %s [room size: %d]",
		req.Client.UserID, req.RoomID, len(h.rooms[req.RoomID]))
}

// handleLeaveRoom removes a client from a room. If this was the
// last local client in the room, unsubscribes from the Redis
// Pub/Sub channel and cleans up the room map entry.
func (h *Hub) handleLeaveRoom(req *RoomRequest) {
	if clients, ok := h.rooms[req.RoomID]; ok {
		// Broadcast peer_left after removing the client so the leaving
		// user doesn't receive their own departure event.
		// Include room_id so multi-room clients know which room it's for.
		rawRoomID := strings.TrimPrefix(req.RoomID, "chat:room:")
		delete(clients, req.Client)
		if len(clients) == 0 {
			delete(h.rooms, req.RoomID)
			if err := h.pubsub.Unsubscribe(h.ctx, req.RoomID); err != nil {
				log.Printf("ws-hub: Redis UNSUBSCRIBE %s failed: %v", req.RoomID, err)
			}
		}

		// Only broadcast if there are still members left to receive it
		if len(clients) > 0 {
			outbound := OutboundMessage{
				Type: "chat.peer_left",
				Payload: map[string]string{
					"peer_id": req.Client.UserID.String(),
					"room_id": rawRoomID,
				},
			}
			outData, _ := json.Marshal(outbound)
			h.RDB.Publish(h.ctx, req.RoomID, outData)
		}
	}

	if req.Done != nil {
		close(req.Done)
	}
}

// handleDirect delivers a message to all active connections of a specific user.
// If the user has multiple tabs open, all of them receive the message.
// If a client's Send buffer is full, that connection is dropped with a warning.
func (h *Hub) handleDirect(msg *DirectMessage) {
	conns, ok := h.clients[msg.TargetUserID]
	if !ok || len(conns) == 0 {
		return // User not connected; message already persisted in DB
	}

	for client := range conns {
		select {
		case client.Send <- msg.Data:
		default:
			log.Printf("ws-hub: dropping direct message for slow client %s (user %s)",
				client.Conn.RemoteAddr(), msg.TargetUserID)
		}
	}
}

// handleRedisMessage fans out a message received from a Redis
// Pub/Sub channel to all local clients in the corresponding room.
func (h *Hub) handleRedisMessage(msg *redis.Message) {
	clients, ok := h.rooms[msg.Channel]
	if !ok {
		return // No local clients in this room
	}

	data := []byte(msg.Payload)
	for client := range clients {
		select {
		case client.Send <- data:
		default:
			log.Printf("ws-hub: dropping Redis fan-out for slow client %s in room %s",
				client.UserID, msg.Channel)
		}
	}
}

// removeClientFromAllRooms evicts a client from every room they
// belong to. Unsubscribes from Redis channels that become empty.
// Redis presence cleanup runs in a background goroutine so that
// Hub.Run() is not blocked by Redis round-trips on disconnect.
func (h *Hub) removeClientFromAllRooms(client *Client) {
	for roomID, clients := range h.rooms {
		if _, ok := clients[client]; !ok {
			continue
		}

		rawRoomID := strings.TrimPrefix(roomID, "chat:room:")

		delete(clients, client)
		if len(clients) == 0 {
			delete(h.rooms, roomID)
			if err := h.pubsub.Unsubscribe(h.ctx, roomID); err != nil {
				log.Printf("ws-hub: Redis UNSUBSCRIBE %s on cleanup failed: %v", roomID, err)
			}
		}

		// Only broadcast peer_left for proper chat rooms (not ephemeral match rooms)
		// and only when there are still members to receive it.
		if strings.HasPrefix(roomID, "chat:room:") && len(clients) > 0 {
			outbound := OutboundMessage{
				Type: "chat.peer_left",
				Payload: map[string]string{
					"peer_id": client.UserID.String(),
					"room_id": rawRoomID,
				},
			}
			outData, _ := json.Marshal(outbound)
			h.RDB.Publish(h.ctx, roomID, outData)
		}

		// Remove Redis room presence off the Run() goroutine — it's a
		// blocking network call that must not stall the Hub event loop.
		if strings.HasPrefix(roomID, "chat:room:") {
			roomIDCopy := rawRoomID
			userIDCopy := client.UserID
			go func() {
				if _, err := h.Store.RemoveRoomPresence(context.Background(), roomIDCopy, userIDCopy); err != nil {
					log.Printf("ws-hub: failed to remove room presence on disconnect: %v", err)
				}
			}()
		}
	}
}

// listenRedis reads messages from the Redis PubSub subscription
// and forwards them to the Hub's event loop via the redisMsgs
// channel. Runs in a dedicated goroutine started by Run().
func (h *Hub) listenRedis() {
	defer h.wg.Done()
	log.Println("ws-hub: Redis Pub/Sub listener started")

	ch := h.pubsub.Channel()
	for msg := range ch {
		select {
		case h.redisMsgs <- msg:
		case <-h.ctx.Done():
			log.Println("ws-hub: Redis Pub/Sub listener stopping")
			return
		}
	}

	log.Println("ws-hub: Redis Pub/Sub channel closed")
}
