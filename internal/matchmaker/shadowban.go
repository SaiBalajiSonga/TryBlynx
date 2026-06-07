// ═══════════════════════════════════════════════════════════════
// File:         internal/matchmaker/shadowban.go
// Purpose:      Shadowban pool isolation logic for the matchmaker
// Dependencies: None (operates on MatchTicket slices)
// Role:         Implements the critical security mandate: shadow-
//               banned users must ONLY be matched with other
//               shadowbanned users. They experience the same UI
//               flow (queue, wait, match) but are transparently
//               quarantined into a separate pool.
//
//               This isolation is enforced BEFORE any compatibility
//               checks run, ensuring zero leakage between pools.
//               The separation happens in a single O(n) pass over
//               the ticket list.
//
//               Design rationale:
//               - Shadowbanned users must not know they are banned.
//               - They still get matched (just only with each other).
//               - Match times may be longer (smaller pool), which is
//                 an acceptable consequence.
//               - The `shadowbanned` flag is in the JWT claims (set
//                 at login from the Postgres column) and stored in
//                 the Redis ticket hash.
// ═══════════════════════════════════════════════════════════════

package matchmaker

// SeparatePools divides a list of match tickets into two
// isolated pools based on the shadowbanned flag:
//
//   - normalPool:  Users with shadowbanned=false. These users
//     are matched with each other normally.
//   - shadowPool:  Users with shadowbanned=true. These users
//     are matched ONLY with other shadowbanned users.
//
// The separation is performed in a single O(n) pass with no
// allocations beyond the two output slices.
//
// Parameters:
//   - tickets: All active match tickets from the Redis waiting pool.
//
// Returns:
//   - normalPool: Tickets for non-shadowbanned users.
//   - shadowPool: Tickets for shadowbanned users.
//
// Example:
//
//	tickets := []*MatchTicket{a, b, c, d}  // b and d are shadowbanned
//	normal, shadow := SeparatePools(tickets)
//	// normal = [a, c]  — matched together
//	// shadow = [b, d]  — matched together, never with a or c
func SeparatePools(tickets []*MatchTicket) (normalPool, shadowPool []*MatchTicket) {
	// Pre-allocate with a bias toward normal users (most users
	// are not shadowbanned)
	normalPool = make([]*MatchTicket, 0, len(tickets))
	shadowPool = make([]*MatchTicket, 0)

	for _, t := range tickets {
		if t.Shadowbanned {
			shadowPool = append(shadowPool, t)
		} else {
			normalPool = append(normalPool, t)
		}
	}

	return normalPool, shadowPool
}
