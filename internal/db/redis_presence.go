package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// AddRoomPresence increments the active presence connection count for a user in a specific room.
func (s *Store) AddRoomPresence(ctx context.Context, roomID string, userID uuid.UUID) error {
	key := "chat:presence:" + roomID
	
	// Increment the hash field for this user by 1 (tracks number of active tabs/connections)
	_, err := s.Redis.HIncrBy(ctx, key, userID.String(), 1).Result()
	if err != nil {
		return fmt.Errorf("redis: failed to add room presence: %w", err)
	}

	return nil
}

// RemoveRoomPresence decrements the presence connection count. If it reaches 0 or less, the user is removed from presence.
func (s *Store) RemoveRoomPresence(ctx context.Context, roomID string, userID uuid.UUID) (int64, error) {
	key := "chat:presence:" + roomID
	field := userID.String()

	// Decrement the connection count
	count, err := s.Redis.HIncrBy(ctx, key, field, -1).Result()
	if err != nil {
		return 0, fmt.Errorf("redis: failed to decrement room presence: %w", err)
	}

	// If count drops to 0 or below (e.g. all tabs closed), remove the user from the presence hash entirely
	if count <= 0 {
		_, err = s.Redis.HDel(ctx, key, field).Result()
		if err != nil {
			return 0, fmt.Errorf("redis: failed to delete room presence field: %w", err)
		}
	}

	return count, nil
}

// GetRoomPresenceCount returns the number of unique active users in the room.
func (s *Store) GetRoomPresenceCount(ctx context.Context, roomID string) (int, error) {
	key := "chat:presence:" + roomID
	count, err := s.Redis.HLen(ctx, key).Result()
	if err != nil {
		// If key doesn't exist, HLen returns 0 with no error, which is perfectly correct.
		if err == redis.Nil {
			return 0, nil
		}
		return 0, fmt.Errorf("redis: failed to get presence count: %w", err)
	}
	return int(count), nil
}

// GetRoomPresenceUsers returns a list of unique user IDs currently active in the room.
func (s *Store) GetRoomPresenceUsers(ctx context.Context, roomID string) ([]uuid.UUID, error) {
	key := "chat:presence:" + roomID
	fields, err := s.Redis.HKeys(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return []uuid.UUID{}, nil
		}
		return nil, fmt.Errorf("redis: failed to get presence users: %w", err)
	}

	var userIDs []uuid.UUID
	for _, f := range fields {
		id, err := uuid.Parse(f)
		if err == nil {
			userIDs = append(userIDs, id)
		}
	}
	return userIDs, nil
}

// AddGlobalPresence increments the global presence count for a user and returns true if it transitioned from 0 to 1 (just went online).
func (s *Store) AddGlobalPresence(ctx context.Context, userID uuid.UUID) (bool, error) {
	key := "global:presence"
	count, err := s.Redis.HIncrBy(ctx, key, userID.String(), 1).Result()
	if err != nil {
		return false, fmt.Errorf("redis: failed to add global presence: %w", err)
	}
	return count == 1, nil
}

// RemoveGlobalPresence decrements the global presence count. Returns true if it dropped to 0 (just went offline).
func (s *Store) RemoveGlobalPresence(ctx context.Context, userID uuid.UUID) (bool, error) {
	key := "global:presence"
	field := userID.String()
	count, err := s.Redis.HIncrBy(ctx, key, field, -1).Result()
	if err != nil {
		return false, fmt.Errorf("redis: failed to remove global presence: %w", err)
	}
	
	if count <= 0 {
		_, err = s.Redis.HDel(ctx, key, field).Result()
		if err != nil {
			return false, fmt.Errorf("redis: failed to delete global presence: %w", err)
		}
		return true, nil
	}
	return false, nil
}

// GetGlobalPresenceUsers checks a list of users and returns a map indicating who is online.
func (s *Store) GetGlobalPresenceUsers(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	key := "global:presence"
	result := make(map[uuid.UUID]bool)
	if len(userIDs) == 0 {
		return result, nil
	}

	fields := make([]string, len(userIDs))
	for i, id := range userIDs {
		fields[i] = id.String()
	}

	// HMGet returns interface{} slice. If field doesn't exist, it's nil.
	vals, err := s.Redis.HMGet(ctx, key, fields...).Result()
	if err != nil {
		return nil, fmt.Errorf("redis: failed to get global presence: %w", err)
	}

	for i, val := range vals {
		if val != nil {
			result[userIDs[i]] = true
		} else {
			result[userIDs[i]] = false
		}
	}
	return result, nil
}
