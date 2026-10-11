// Package e2ee implements account recovery and X3DH key epochs for Mini-Hermes.
// Messages use a stateless KDF; there is no Double Ratchet. The legacy v1
// per-message functions remain for profile/vector regression tests only.
package e2ee

type KeyPair struct {
	Private [32]byte
	Public  [32]byte
}

type PublicPrekey struct {
	KeyID     int64  `json:"key_id"`
	PublicKey string `json:"public_key"`
}

type SignedPrekey struct {
	KeyID     int64  `json:"key_id"`
	PublicKey string `json:"public_key"`
	Signature string `json:"signature"`
}

type UploadRequest struct {
	IdentityPublicKey string         `json:"identity_public_key"`
	SignedPrekey      SignedPrekey   `json:"signed_prekey"`
	OneTimePrekeys    []PublicPrekey `json:"one_time_prekeys"`
}

type ClaimRequest struct {
	ThreadID string `json:"thread_id"`
}

type Bundle struct {
	UserID            string        `json:"user_id"`
	IdentityPublicKey string        `json:"identity_public_key"`
	SignedPrekey      SignedPrekey  `json:"signed_prekey"`
	OneTimePrekey     *PublicPrekey `json:"one_time_prekey"`
}
