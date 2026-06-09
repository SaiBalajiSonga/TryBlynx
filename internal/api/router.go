// ═══════════════════════════════════════════════════════════════
// File:         internal/api/router.go
// Purpose:      HTTP router configuration, route registration,
//               and shared response helpers
// Dependencies: github.com/go-chi/chi/v5, github.com/stripe/stripe-go/v81,
//               internal/auth, internal/config, internal/db
// Role:         Central wiring point for all HTTP endpoints. Creates
//               the chi.Router with global middleware, registers
//               public and authenticated route groups, and provides
//               the Server struct that carries dependencies into all
//               handler methods. Also defines JSON response helper
//               functions used across all handler files.
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/stripe/stripe-go/v81"

	"tryblynx/internal/auth"
	"tryblynx/internal/config"
	"tryblynx/internal/db"
)

// Server holds all dependencies required by HTTP handlers.
// It is created once at startup and shared across all handler
// methods via method receivers.
//
// Fields:
//   - Config: Application configuration (JWT secret, Stripe keys, etc.)
//   - Store:  Database access layer (internal/db.Store).
//   - Router: The configured chi.Router ready for http.ListenAndServe.
type Server struct {
	Config *config.Config
	Store  *db.Store
	Router chi.Router
}

// NewServer initializes the HTTP router with all routes,
// middleware, and the Stripe API key.
//
// Parameters:
//   - cfg:   Validated application configuration.
//   - store: Initialized database store.
//
// Returns:
//   - *Server: Fully wired server with Router ready to serve.
//
// Route layout:
//
//	Public:
//	  POST   /api/register         → RegisterHandler
//	  POST   /api/login            → LoginHandler
//	  POST   /api/webhook/stripe   → StripeWebhookHandler
//	  GET    /health               → health check
//
//	Authenticated (JWT required):
//	  GET    /api/profile           → GetProfileHandler
//	  PUT    /api/profile           → UpdateProfileHandler
//	  GET    /api/profile/{id}      → GetProfileByIDHandler
//	  GET    /api/feed              → GetFeedHandler
//	  POST   /api/feed              → CreateFeedPostHandler
//	  GET    /api/dm/list           → ListDMsHandler
//	  POST   /api/dm/send           → SendDMHandler
//	  GET    /api/dm/{conversationId} → GetDMMessagesHandler
//	  POST   /api/checkout          → CreateCheckoutHandler
func NewServer(cfg *config.Config, store *db.Store) *Server {
	// Set Stripe API key globally (thread-safe, set once at startup)
	stripe.Key = cfg.StripeSecretKey

	s := &Server{
		Config: cfg,
		Store:  store,
		Router: chi.NewRouter(),
	}

	// ── Global middleware ─────────────────────────────────────
	s.Router.Use(middleware.RequestID)
	s.Router.Use(middleware.RealIP)
	s.Router.Use(middleware.Logger)
	s.Router.Use(middleware.Recoverer)
	s.Router.Use(corsMiddleware)

	// ── Public routes (no authentication) ─────────────────────
	s.Router.Post("/api/register", s.RegisterHandler)
	s.Router.Post("/api/login", s.LoginHandler)
	s.Router.Post("/api/webhook/stripe", s.StripeWebhookHandler)

	s.Router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// ── Authenticated routes ──────────────────────────────────
	s.Router.Group(func(r chi.Router) {
		r.Use(auth.Middleware(cfg.JWTSecret))

		// Profile
		r.Get("/api/profile", s.GetProfileHandler)
		r.Put("/api/profile", s.UpdateProfileHandler)
		r.Get("/api/profile/{id}", s.GetProfileByIDHandler)
		
		// Users
		r.Get("/api/users/search", s.SearchUsersHandler)

		// Moderation (Blocking/Reporting/Strikes)
		r.Post("/api/moderation/block", s.BlockUserHandler)
		r.Post("/api/moderation/unblock", s.UnblockUserHandler)
		r.Post("/api/moderation/report", s.ReportUserHandler)
		r.Post("/api/moderation/fingerprint", s.FingerprintHandler)
		r.Post("/api/moderation/strike", s.StrikeHandler)

		// Global Feed
		r.Get("/api/feed", s.GetFeedHandler)
		r.Post("/api/feed", s.CreateFeedPostHandler)

		// Public Groups
		r.Get("/api/groups", s.ListGroupsHandler)
		r.Get("/api/groups/{id}/members", s.GetGroupMembersHandler)

		// Direct Messages
		r.Get("/api/dm/list", s.ListDMsHandler)
		r.Post("/api/dm/send", s.SendDMHandler)
		r.Get("/api/dm/{conversationId}", s.GetDMMessagesHandler)

		// Stripe Checkout (creates payment session)
		r.Post("/api/checkout", s.CreateCheckoutHandler)

		// Admin Group Management
		r.Post("/api/admin/groups", s.AdminCreateGroupHandler)
		r.Put("/api/admin/groups/{id}", s.AdminUpdateGroupHandler)
		r.Delete("/api/admin/groups/{id}", s.AdminDeleteGroupHandler)
	})

	return s
}

// ══════════════════════════════════════════════════════════════
// Response Helpers
// ══════════════════════════════════════════════════════════════

// respondJSON marshals data to JSON and writes it to the response
// with the given HTTP status code.
//
// Parameters:
//   - w:      The HTTP response writer.
//   - status: HTTP status code (e.g., http.StatusOK).
//   - data:   Any JSON-serializable value, or nil for empty body.
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			log.Printf("api: failed to encode JSON response: %v", err)
		}
	}
}

// respondError writes a JSON error response in the standard
// format: {"error": "<message>"}.
//
// Parameters:
//   - w:       The HTTP response writer.
//   - status:  HTTP status code (e.g., http.StatusBadRequest).
//   - message: Human-readable error description.
func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// ══════════════════════════════════════════════════════════════
// CORS Middleware
// ══════════════════════════════════════════════════════════════

// corsMiddleware adds permissive CORS headers for local development.
// In production, Access-Control-Allow-Origin should be restricted
// to the actual frontend domain.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Upgrade, Connection")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
