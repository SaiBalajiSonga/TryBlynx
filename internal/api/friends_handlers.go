// ═══════════════════════════════════════════════════════════════
// File:         internal/api/friends_handlers.go
// Purpose:      Friend system, notifications, guest auth, StartDM,
//               and moderator profile review endpoints
// ═══════════════════════════════════════════════════════════════

package api

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"tryblynx/internal/auth"
	"tryblynx/internal/ws"
)

// ══════════════════════════════════════════════════════════════
// GUEST / ANONYMOUS LOGIN
// ══════════════════════════════════════════════════════════════

// GuestLoginHandler handles POST /api/guest.
// Creates an ephemeral anonymous account and returns a JWT.
// No email or password required. Account expires in 24h.
func (s *Server) GuestLoginHandler(w http.ResponseWriter, r *http.Request) {
	username := "guest_" + randomAlphanumeric(8)

	user, err := s.Store.CreateGuestUser(r.Context(), username)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create guest account")
		return
	}

	token, err := auth.GenerateToken(
		s.Config.JWTSecret, user.ID, false, false, s.Config.JWTExpiryHours,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	respondJSON(w, http.StatusCreated, authResponse{Token: token, User: user})
}

func randomAlphanumeric(n int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

// ══════════════════════════════════════════════════════════════
// START DM (friendship-gated)
// ══════════════════════════════════════════════════════════════

// StartDMHandler handles GET /api/dm/start?recipient_id={uuid}.
// Returns the conversation_id for a DM with the given user.
// Requires an accepted friendship — returns 403 with error "not_friends" otherwise.
func (s *Server) StartDMHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())

	recipientIDStr := r.URL.Query().Get("recipient_id")
	if recipientIDStr == "" {
		respondError(w, http.StatusBadRequest, "recipient_id is required")
		return
	}
	recipientID, err := uuid.Parse(recipientIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid recipient_id format")
		return
	}
	if recipientID == callerID {
		respondError(w, http.StatusBadRequest, "cannot start a DM with yourself")
		return
	}

	// Block anonymous users from DMing
	caller, err := s.Store.GetUserByID(r.Context(), callerID)
	if err != nil || caller == nil {
		respondError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if caller.IsAnonymous {
		respondError(w, http.StatusForbidden, "guest accounts cannot send direct messages")
		return
	}

	// Gate on friendship
	isFriend, err := s.Store.IsFriend(r.Context(), callerID, recipientID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if !isFriend {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "not_friends",
			"message": "You must be friends to send direct messages.",
		})
		return
	}

	convID, err := s.Store.GetOrCreateDM(r.Context(), callerID, recipientID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to initialize conversation")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"conversation_id": convID.String(),
	})
}

// ══════════════════════════════════════════════════════════════
// FRIEND REQUESTS
// ══════════════════════════════════════════════════════════════

type friendActionRequest struct {
	UserID string `json:"user_id"`
}

// SendFriendRequestHandler handles POST /api/friends/request.
func (s *Server) SendFriendRequestHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())

	// Block anonymous users
	caller, _ := s.Store.GetUserByID(r.Context(), callerID)
	if caller != nil && caller.IsAnonymous {
		respondError(w, http.StatusForbidden, "guest accounts cannot send friend requests")
		return
	}

	var req friendActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	targetID, err := uuid.Parse(req.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user_id format")
		return
	}
	if targetID == callerID {
		respondError(w, http.StatusBadRequest, "cannot send a friend request to yourself")
		return
	}

	// Check target exists
	target, err := s.Store.GetUserByID(r.Context(), targetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}
	if target == nil {
		respondError(w, http.StatusNotFound, "user not found")
		return
	}

	friendship, err := s.Store.SendFriendRequest(r.Context(), callerID, targetID)
	if err != nil {
		if strings.Contains(err.Error(), "blocked relationship exists") {
			respondError(w, http.StatusForbidden, "cannot send a friend request: a block relationship exists")
			return
		}
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			respondError(w, http.StatusConflict, "friend request already sent or relationship exists")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to send friend request")
		return
	}

	// Create notification for recipient
	callerActorID := callerID
	notif, _ := s.Store.CreateNotificationRaw(
		r.Context(), targetID, "friend_request", &callerActorID,
		fmt.Sprintf(`{"friendship_id":"%s"}`, friendship.ID),
	)

	// Push WS notification to recipient (if online)
	if notif != nil && s.Hub != nil {
		s.pushNotification(targetID, notif)
	}

	respondJSON(w, http.StatusCreated, friendship)
}

// AcceptFriendRequestHandler handles POST /api/friends/accept.
func (s *Server) AcceptFriendRequestHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())

	var req friendActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	requesterID, err := uuid.Parse(req.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user_id format")
		return
	}

	// callerID is the addressee; requesterID is the original sender
	friendship, err := s.Store.AcceptFriendRequest(r.Context(), requesterID, callerID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to accept friend request")
		return
	}

	// Notify the original requester that their request was accepted
	callerActorID := callerID
	notif, _ := s.Store.CreateNotificationRaw(
		r.Context(), requesterID, "friend_accepted", &callerActorID,
		fmt.Sprintf(`{"friendship_id":"%s"}`, friendship.ID),
	)
	if notif != nil && s.Hub != nil {
		s.pushNotification(requesterID, notif)
	}

	respondJSON(w, http.StatusOK, friendship)
}

// DeclineFriendRequestHandler handles POST /api/friends/decline.
func (s *Server) DeclineFriendRequestHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())

	var req friendActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	requesterID, err := uuid.Parse(req.UserID)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user_id format")
		return
	}

	if err := s.Store.DeclineFriendRequest(r.Context(), requesterID, callerID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to decline friend request")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "declined"})
}

// RemoveFriendHandler handles DELETE /api/friends/{userId}.
func (s *Server) RemoveFriendHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())
	friendIDStr := chi.URLParam(r, "userId")
	friendID, err := uuid.Parse(friendIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user ID")
		return
	}

	if err := s.Store.RemoveFriend(r.Context(), callerID, friendID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to remove friend")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

// CancelFriendRequestHandler handles DELETE /api/friends/request/{userId}.
// Cancels an outgoing pending friend request sent by the caller.
func (s *Server) CancelFriendRequestHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())
	targetIDStr := chi.URLParam(r, "userId")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user ID")
		return
	}

	// callerID is the requester; targetID is the addressee
	if err := s.Store.CancelFriendRequest(r.Context(), callerID, targetID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to cancel friend request")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

// ListFriendsHandler handles GET /api/friends.
func (s *Server) ListFriendsHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())
	friends, err := s.Store.GetFriends(r.Context(), callerID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch friends")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"friends": friends,
		"count":   len(friends),
	})
}

// ListFriendRequestsHandler handles GET /api/friends/requests.
func (s *Server) ListFriendRequestsHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())
	requests, err := s.Store.GetFriendRequests(r.Context(), callerID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch friend requests")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"requests": requests,
		"count":    len(requests),
	})
}

// GetFriendStatusHandler handles GET /api/friends/status/{userId}.
func (s *Server) GetFriendStatusHandler(w http.ResponseWriter, r *http.Request) {
	callerID := auth.UserIDFromContext(r.Context())
	targetIDStr := chi.URLParam(r, "userId")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid user ID")
		return
	}

	status, err := s.Store.GetFriendshipStatus(r.Context(), callerID, targetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch friendship status")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": status})
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

// GetNotificationsHandler handles GET /api/notifications.
func (s *Server) GetNotificationsHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	notifs, err := s.Store.GetNotifications(r.Context(), userID, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch notifications")
		return
	}

	unreadCount, _ := s.Store.GetUnreadNotificationCount(r.Context(), userID)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"notifications": notifs,
		"unread_count":  unreadCount,
	})
}

// MarkNotificationsReadHandler handles POST /api/notifications/read.
func (s *Server) MarkNotificationsReadHandler(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if err := s.Store.MarkNotificationsRead(r.Context(), userID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to mark notifications read")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ══════════════════════════════════════════════════════════════
// MODERATOR PROFILE REVIEW QUEUE
// ══════════════════════════════════════════════════════════════

// requireMod is an inline authorization check for mod/admin/developer roles.
func (s *Server) requireMod(r *http.Request) (*bool, error) {
	userID := auth.UserIDFromContext(r.Context())
	user, err := s.Store.GetUserByID(r.Context(), userID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("user not found")
	}
	if !user.IsModerator && !user.IsAdmin && !user.IsDeveloper {
		return nil, fmt.Errorf("forbidden")
	}
	ok := true
	return &ok, nil
}

// GetModQueueHandler handles GET /api/mod/reviews — pending profile reviews.
func (s *Server) GetModQueueHandler(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireMod(r); err != nil {
		respondError(w, http.StatusForbidden, "moderator access required")
		return
	}

	reviews, err := s.Store.GetPendingProfileReviews(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch review queue")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"reviews": reviews,
		"count":   len(reviews),
	})
}

// GetModLogHandler handles GET /api/mod/log — full review history.
func (s *Server) GetModLogHandler(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireMod(r); err != nil {
		respondError(w, http.StatusForbidden, "moderator access required")
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	reviews, err := s.Store.GetAllProfileReviews(r.Context(), limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to fetch mod log")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"reviews": reviews,
		"count":   len(reviews),
	})
}

type reviewDecisionRequest struct {
	Reason string `json:"reason"`
}

// ApproveProfileReviewHandler handles POST /api/mod/reviews/{id}/approve.
func (s *Server) ApproveProfileReviewHandler(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireMod(r); err != nil {
		respondError(w, http.StatusForbidden, "moderator access required")
		return
	}

	reviewerID := auth.UserIDFromContext(r.Context())
	reviewIDStr := chi.URLParam(r, "id")
	reviewID, err := uuid.Parse(reviewIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid review ID")
		return
	}

	pr, err := s.Store.ApproveProfileReview(r.Context(), reviewID, reviewerID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to approve review")
		return
	}

	// Notify user that their profile was approved
	reviewerActorID := reviewerID
	notif, _ := s.Store.CreateNotificationRaw(
		r.Context(), pr.UserID, "profile_approved", &reviewerActorID, `{}`,
	)
	if notif != nil && s.Hub != nil {
		s.pushNotification(pr.UserID, notif)
	}

	respondJSON(w, http.StatusOK, pr)
}

// RejectProfileReviewHandler handles POST /api/mod/reviews/{id}/reject.
func (s *Server) RejectProfileReviewHandler(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireMod(r); err != nil {
		respondError(w, http.StatusForbidden, "moderator access required")
		return
	}

	reviewerID := auth.UserIDFromContext(r.Context())
	reviewIDStr := chi.URLParam(r, "id")
	reviewID, err := uuid.Parse(reviewIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid review ID")
		return
	}

	var req reviewDecisionRequest
	json.NewDecoder(r.Body).Decode(&req)

	pr, err := s.Store.RejectProfileReview(r.Context(), reviewID, reviewerID, req.Reason)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to reject review")
		return
	}

	respondJSON(w, http.StatusOK, pr)
}

// ══════════════════════════════════════════════════════════════
// WS NOTIFICATION PUSH HELPER
// ══════════════════════════════════════════════════════════════

// Hub is stored on Server to enable WS pushes from HTTP handlers.
// It is set at startup by the main server initialization.
var _ = (*ws.Hub)(nil) // import reference

// pushNotification sends a notification.push WS event to a user.
func (s *Server) pushNotification(userID uuid.UUID, notif interface{}) {
	if s.Hub == nil {
		return
	}
	data, err := json.Marshal(map[string]interface{}{
		"type":    "notification.push",
		"payload": notif,
	})
	if err != nil {
		return
	}
	s.Hub.SendToUser(userID, data)
}
