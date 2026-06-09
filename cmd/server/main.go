// ═══════════════════════════════════════════════════════════════
// File:         cmd/server/main.go
// Purpose:      Application entry point — wires all subsystems
//               and starts the HTTP/WebSocket server
// Dependencies: All internal packages (config, db, redisclient,
//               api, ws, matchmaker)
// Role:         The main function is the single orchestration
//               point that:
//               1. Loads configuration from environment variables
//               2. Connects to PostgreSQL (bounded pgxpool)
//               3. Connects to Redis (pooled client)
//               4. Creates the HTTP API server (chi router)
//               5. Creates the WebSocket Hub (channel-based)
//               6. Starts the Matchmaker worker (batch processor)
//               7. Registers the /ws endpoint on the router
//               8. Starts the HTTP server
//               9. Handles graceful shutdown on SIGINT/SIGTERM
//
//               Shutdown order is the reverse of startup:
//               1. Stop accepting new HTTP connections
//               2. Stop the Matchmaker worker
//               3. Shutdown the Hub (close Redis Pub/Sub)
//               4. Close PostgreSQL pool
//               5. Exit
// ═══════════════════════════════════════════════════════════════

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tryblynx/internal/api"
	"tryblynx/internal/config"
	"tryblynx/internal/db"
	"tryblynx/internal/matchmaker"
	redisclient "tryblynx/internal/redisclient"
	"tryblynx/internal/worker"
	"tryblynx/internal/ws"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("═══ TryBlynx Server Starting ═══")

	// ── 1. Load Configuration ────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	log.Printf("config: loaded (port=%s, jwt_expiry=%dh)", cfg.ServerPort, cfg.JWTExpiryHours)

	// ── 2. Connect to Redis ──────────────────────────────────
	rdb, err := redisclient.NewClient(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis: %v", err)
	}
	defer rdb.Close()
	log.Println("redis: connected")

	// ── 3. Connect to PostgreSQL ─────────────────────────────
	pool, err := db.NewPool(context.Background(), cfg)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()
	store := db.NewStore(pool, rdb)
	log.Println("postgres: connected")

	// ── 3.5 Start Background Workers ──────────────────────────
	worker.StartCleanupWorker(store)

	// ── 4. Create HTTP API Server ────────────────────────────
	apiServer := api.NewServer(cfg, store)
	log.Println("api: router initialized")

	// ── 5. Create WebSocket Hub ──────────────────────────────
	hub := ws.NewHub(store, rdb, cfg)
	go hub.Run()
	log.Println("ws: hub started")

	// ── 6. Start Matchmaker Worker ───────────────────────────
	mmWorker := matchmaker.NewWorker(rdb, store, hub, matchmaker.WorkerConfig{
		TickInterval:       500 * time.Millisecond,
		DropInterestsAfter: 10 * time.Second,
		DropLocationAfter:  20 * time.Second,
		DropLanguageAfter:  30 * time.Second,
	})
	mmWorker.Start()
	log.Println("matchmaker: worker started")

	// ── 7. Register WebSocket Endpoint on Router ─────────────
	// The /ws endpoint is on the same router as the REST API.
	// JWT authentication is handled inside hub.ServeWS, NOT
	// by the chi middleware (since tokens come via query param).
	apiServer.Router.Get("/ws", hub.ServeWS)
	log.Println("ws: /ws endpoint registered")

	// ── 8. Create HTTP Server ────────────────────────────────
	httpServer := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      apiServer.Router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// ── 9. Start Server (non-blocking) ───────────────────────
	go func() {
		log.Printf("═══ TryBlynx Server listening on :%s ═══", cfg.ServerPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	// ── 10. Graceful Shutdown ────────────────────────────────
	// Wait for SIGINT (Ctrl+C) or SIGTERM (Docker stop)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("═══ Shutdown signal received: %s ═══", sig)

	// Create a deadline for the shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Step 1: Stop accepting new HTTP connections
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("http: forced shutdown: %v", err)
	}
	log.Println("http: server stopped")

	// Step 2: Stop the Matchmaker worker
	mmWorker.Stop()

	// Step 3: Shutdown the Hub (closes Redis Pub/Sub)
	hub.Shutdown()

	// Step 4: PostgreSQL pool is closed by defer
	// Step 5: Redis client is closed by defer

	log.Println("═══ TryBlynx Server stopped cleanly ═══")
}
