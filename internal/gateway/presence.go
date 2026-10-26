package gateway

import (
	"encoding/json"
	"sort"
)

type presenceSnapshot struct {
	Type          string   `json:"type"`
	Revision      uint64   `json:"revision"`
	OnlineUserIDs []string `json:"online_user_ids"`
}

type presenceChanged struct {
	Type     string `json:"type"`
	Revision uint64 `json:"revision"`
	UserID   string `json:"user_id"`
	Online   bool   `json:"online"`
}

// All presence helpers require h.mu's exclusive lock. The socket map is the
// source of truth; there is no independent user count or persistent presence.
func (h *Hub) presenceSnapshotLocked() []byte {
	ids := make([]string, 0, len(h.clients))
	for userID := range h.clients {
		ids = append(ids, userID)
	}
	sort.Strings(ids)
	// These fixed payloads contain only JSON-supported types and cannot fail.
	data, _ := json.Marshal(presenceSnapshot{
		Type: "presence.snapshot", Revision: h.presenceRevision, OnlineUserIDs: ids,
	})
	return data
}

func (h *Hub) presenceChangedLocked(userID string, online bool, except *client) []*client {
	data, _ := json.Marshal(presenceChanged{
		Type: "presence.changed", Revision: h.presenceRevision, UserID: userID, Online: online,
	})
	var slow []*client
	for _, connections := range h.clients {
		for c := range connections {
			if c != except && !enqueue(c, data) {
				slow = append(slow, c)
			}
		}
	}
	return slow
}
