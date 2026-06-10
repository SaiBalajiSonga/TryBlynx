package worker

import (
	"context"
	"log"
	"time"

	"tryblynx/internal/db"
)

// StartCleanupWorker starts a background goroutine that periodically:
//   - Deletes messages older than 30 days from public groups (daily)
//   - Purges expired anonymous/guest user accounts (hourly)
func StartCleanupWorker(store *db.Store) {
	go func() {
		log.Println("worker: cleanup worker started")

		dailyTicker := time.NewTicker(24 * time.Hour)
		hourlyTicker := time.NewTicker(1 * time.Hour)
		defer dailyTicker.Stop()
		defer hourlyTicker.Stop()

		// Run both immediately on boot
		cleanupOldMessages(store)
		purgeExpiredGuests(store)

		for {
			select {
			case <-dailyTicker.C:
				cleanupOldMessages(store)
			case <-hourlyTicker.C:
				purgeExpiredGuests(store)
			}
		}
	}()
}

func cleanupOldMessages(store *db.Store) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	cmd, err := store.Pool.Exec(ctx, `
		DELETE FROM messages 
		WHERE created_at < NOW() - INTERVAL '30 days'
	`)
	if err != nil {
		log.Printf("worker: failed to cleanup old messages: %v", err)
		return
	}
	if n := cmd.RowsAffected(); n > 0 {
		log.Printf("worker: deleted %d messages older than 30 days", n)
	}
}

// purgeExpiredGuests deletes anonymous accounts past their 24h expiry.
func purgeExpiredGuests(store *db.Store) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	n, err := store.PurgeExpiredGuests(ctx)
	if err != nil {
		log.Printf("worker: failed to purge expired guests: %v", err)
		return
	}
	if n > 0 {
		log.Printf("worker: purged %d expired guest accounts", n)
	}
}
