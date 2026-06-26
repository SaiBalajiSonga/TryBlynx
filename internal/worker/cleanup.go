package worker

import (
	"context"
	"log"
	"time"

	"lynxus/internal/db"
)

// StartCleanupWorker starts a background goroutine that periodically:
//   - Trims group chats to keep only the latest 1000 messages (hourly)
func StartCleanupWorker(store *db.Store) {
	go func() {
		log.Println("worker: cleanup worker started")

		hourlyTicker := time.NewTicker(1 * time.Hour)
		defer hourlyTicker.Stop()

		// Run both immediately on boot
		cleanupOldMessages(store)

		for range hourlyTicker.C {
			cleanupOldMessages(store)
		}
	}()
}

func cleanupOldMessages(store *db.Store) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Delete messages in group chats that exceed the 1000 message limit
	cmd, err := store.Pool.Exec(ctx, `
		WITH RankedMessages AS (
			SELECT m.id, ROW_NUMBER() OVER(PARTITION BY m.conversation_id ORDER BY m.created_at DESC) as rn
			FROM messages m
			JOIN conversations c ON m.conversation_id = c.id
			WHERE c.type = 'group'
		)
		DELETE FROM messages
		WHERE id IN (
			SELECT id FROM RankedMessages WHERE rn > 1000
		)
	`)
	if err != nil {
		log.Printf("worker: failed to cap group messages: %v", err)
		return
	}
	if n := cmd.RowsAffected(); n > 0 {
		log.Printf("worker: deleted %d messages exceeding the 1000-message group cap", n)
	}
}

