package worker

import (
	"context"
	"log"
	"time"

	"tryblynx/internal/db"
)

// StartCleanupWorker starts a background goroutine that periodically
// deletes messages older than 30 days from public groups.
func StartCleanupWorker(store *db.Store) {
	go func() {
		log.Println("worker: Data retention cleanup worker started")
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		for {
			// Also run immediately on boot
			cleanupOldMessages(store)
			<-ticker.C
		}
	}()
}

func cleanupOldMessages(store *db.Store) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Delete messages older than 30 days. We use the database's NOW() function.
	cmd, err := store.Pool.Exec(ctx, `
		DELETE FROM messages 
		WHERE created_at < NOW() - INTERVAL '30 days'
	`)
	
	if err != nil {
		log.Printf("worker: Failed to cleanup old messages: %v", err)
		return
	}

	deletedCount := cmd.RowsAffected()
	if deletedCount > 0 {
		log.Printf("worker: Deleted %d messages older than 30 days", deletedCount)
	}
}
