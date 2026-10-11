package event

const ThreadUpdatedType = "thread.updated"

// ThreadUpdated asks recipients to reload the existing thread summary API.
type ThreadUpdated struct {
	ThreadID     string
	RecipientIDs []string
}
