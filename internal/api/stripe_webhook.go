// ═══════════════════════════════════════════════════════════════
// File:         internal/api/stripe_webhook.go
// Purpose:      Stripe Checkout payment session creation and
//               webhook handler with cryptographic signature
//               verification
// Dependencies: github.com/stripe/stripe-go/v81,
//               github.com/stripe/stripe-go/v81/checkout/session,
//               github.com/stripe/stripe-go/v81/webhook,
//               github.com/google/uuid, internal/auth, internal/db
// Role:         Two endpoints:
//               - POST /api/webhook/stripe (PUBLIC, no JWT)
//                 Receives Stripe webhook events, verifies the
//                 Stripe-Signature header cryptographically using
//                 webhook.ConstructEvent(), and upgrades the user's
//                 is_vip status on checkout.session.completed.
//               - POST /api/checkout (AUTHENTICATED, JWT required)
//                 Creates a Stripe Checkout Session with the user's
//                 ID in metadata, returns the checkout URL.
//
// SECURITY CRITICAL:
//   The webhook endpoint must NOT be behind JWT middleware. It
//   receives requests from Stripe's servers, not from authenticated
//   users. All authentication is via the Stripe-Signature header.
//   The raw request body must be read before any JSON parsing to
//   ensure signature verification uses the exact bytes Stripe signed.
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/stripe/stripe-go/v81"
	checksession "github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/webhook"

	"lynxus/internal/auth"
)

// maxWebhookPayload is the maximum allowed size (in bytes) for a
// Stripe webhook request body. Set to 64KB to prevent denial-of-
// service via oversized payloads while accommodating all standard
// Stripe event types.
const maxWebhookPayload = 65536

// ══════════════════════════════════════════════════════════════
// Webhook Handler (PUBLIC — no JWT)
// ══════════════════════════════════════════════════════════════

// StripeWebhookHandler handles POST /api/webhook/stripe.
//
// This endpoint receives webhook events from Stripe's servers.
// It performs three critical security steps:
//
//  1. Reads the raw request body (limited to 64KB).
//  2. Verifies the Stripe-Signature header cryptographically
//     using the STRIPE_WEBHOOK_SECRET. This proves the request
//     genuinely came from Stripe and hasn't been tampered with.
//  3. Routes the verified event by type. Currently handles:
//     - checkout.session.completed → upgrades user to VIP.
//
// All unhandled event types are acknowledged with 200 OK to
// prevent Stripe from disabling the webhook endpoint.
//
// Status codes:
//   - 200 OK:          Event processed or acknowledged.
//   - 400 Bad Request: Invalid signature, malformed payload, or
//     missing metadata.
//   - 500 Internal:    Database failure during VIP upgrade.
func (s *Server) StripeWebhookHandler(w http.ResponseWriter, r *http.Request) {
	// ── Step 1: Read raw body with size limit ────────────────
	// IMPORTANT: Must read raw bytes BEFORE any JSON parsing.
	// The signature is computed over the exact byte sequence.
	payload, err := io.ReadAll(io.LimitReader(r.Body, maxWebhookPayload))
	if err != nil {
		log.Printf("stripe-webhook: failed to read request body: %v", err)
		respondError(w, http.StatusBadRequest, "failed to read request body")
		return
	}

	// ── Step 2: Cryptographic signature verification ─────────
	sigHeader := r.Header.Get("Stripe-Signature")
	if sigHeader == "" {
		log.Printf("stripe-webhook: missing Stripe-Signature header")
		respondError(w, http.StatusBadRequest, "missing Stripe-Signature header")
		return
	}

	event, err := webhook.ConstructEvent(payload, sigHeader, s.Config.StripeWebhookSecret)
	if err != nil {
		log.Printf("stripe-webhook: signature verification FAILED: %v", err)
		respondError(w, http.StatusBadRequest, "webhook signature verification failed")
		return
	}

	log.Printf("stripe-webhook: received verified event: type=%s id=%s", event.Type, event.ID)

	// ── Step 3: Route by event type ──────────────────────────
	switch event.Type {
	case "checkout.session.completed":
		s.handleCheckoutCompleted(w, r, event)

	default:
		// Acknowledge unhandled events to prevent Stripe from
		// marking the endpoint as unhealthy
		w.WriteHeader(http.StatusOK)
	}
}

// handleCheckoutCompleted processes the checkout.session.completed
// event. Extracts the user_id from the session's metadata (set
// during checkout session creation in CreateCheckoutHandler) and
// upgrades the user to VIP in the database.
//
// Parameters:
//   - w:     HTTP response writer.
//   - r:     HTTP request (for context).
//   - event: The verified Stripe event.
func (s *Server) handleCheckoutCompleted(w http.ResponseWriter, r *http.Request, event stripe.Event) {
	// Unmarshal the event data into a typed CheckoutSession
	var session stripe.CheckoutSession
	if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
		log.Printf("stripe-webhook: failed to unmarshal checkout session: %v", err)
		respondError(w, http.StatusBadRequest, "failed to parse checkout session data")
		return
	}

	// ── Extract user_id from metadata ────────────────────────
	userIDStr, exists := session.Metadata["user_id"]
	if !exists || userIDStr == "" {
		log.Printf("stripe-webhook: checkout session %s missing user_id metadata", session.ID)
		respondError(w, http.StatusBadRequest, "checkout session missing user_id in metadata")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		log.Printf("stripe-webhook: invalid user_id in metadata: %q", userIDStr)
		respondError(w, http.StatusBadRequest, "invalid user_id format in metadata")
		return
	}

	// ── Upgrade user to VIP ──────────────────────────────────
	if err := s.Store.SetUserVIP(r.Context(), userID, true); err != nil {
		log.Printf("stripe-webhook: failed to set VIP for user %s: %v", userID, err)
		respondError(w, http.StatusInternalServerError, "failed to update VIP status")
		return
	}

	log.Printf("stripe-webhook: ✓ user %s upgraded to VIP (session: %s)", userID, session.ID)
	w.WriteHeader(http.StatusOK)
}

// ══════════════════════════════════════════════════════════════
// Checkout Session Creator (AUTHENTICATED — JWT required)
// ══════════════════════════════════════════════════════════════

// CreateCheckoutHandler handles POST /api/checkout.
//
// Creates a Stripe Checkout Session for the authenticated user to
// purchase VIP status. The user's UUID is embedded in the session
// metadata so the webhook handler can identify them upon payment
// completion.
//
// Checkout configuration:
//   - Mode:    One-time payment (not subscription).
//   - Product: "Lynxus VIP" at $9.99 USD.
//   - Success: Redirects to {origin}/success?session_id=...
//   - Cancel:  Redirects to {origin}/cancel
//
// Status codes:
//   - 200 OK:  Checkout session created, URL returned.
//   - 500 Internal: Stripe API failure.
//
// Response:
//
//	{"checkout_url": "https://checkout.stripe.com/...", "session_id": "cs_..."}
func (s *Server) CreateCheckoutHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	// ── Determine redirect URLs ──────────────────────────────
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = r.Header.Get("Referer")
	}
	if origin == "" {
		origin = "http://localhost:3000" // fallback for API-only testing
	}

	// ── Create Stripe Checkout Session ───────────────────────
	params := &stripe.CheckoutSessionParams{
		Mode: stripe.String(string(stripe.CheckoutSessionModePayment)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency: stripe.String("usd"),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name:        stripe.String("Lynxus VIP"),
						Description: stripe.String("Unlock premium features: gender-filtered matching, priority queue placement"),
					},
					UnitAmount: stripe.Int64(999), // $9.99 in cents
				},
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(origin + "/success?session_id={CHECKOUT_SESSION_ID}"),
		CancelURL:  stripe.String(origin + "/cancel"),
	}

	// Embed user_id in metadata for the webhook to pick up
	params.AddMetadata("user_id", userID.String())

	sess, err := checksession.New(params)
	if err != nil {
		log.Printf("stripe-checkout: failed to create session for user %s: %v", userID, err)
		respondError(w, http.StatusInternalServerError, "failed to create checkout session")
		return
	}

	log.Printf("stripe-checkout: session %s created for user %s", sess.ID, userID)

	respondJSON(w, http.StatusOK, map[string]string{
		"checkout_url": sess.URL,
		"session_id":   sess.ID,
	})
}
