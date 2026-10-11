// The legacy per-message X3DH profile is retained only for regression tests.
// Production uses the shared primitives in crypto.go and the fixed v2 session.
package e2ee

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"unicode/utf8"
)

type MessageContext struct {
	ThreadID, MessageID, SenderID, RecipientID string
}

type Envelope struct {
	Version           int    `json:"version"`
	RecipientID       string `json:"recipient_id"`
	SenderIdentityKey string `json:"sender_identity_key"`
	EphemeralKey      string `json:"ephemeral_key"`
	SignedPrekeyID    int64  `json:"signed_prekey_id"`
	OneTimePrekeyID   *int64 `json:"one_time_prekey_id"`
	Nonce             string `json:"nonce"`
	Ciphertext        string `json:"ciphertext"`
}

func ParseEnvelope(content string) (Envelope, error) {
	if len(content) > 8192 || !utf8.ValidString(content) {
		return Envelope{}, ErrInvalidEnvelope
	}
	// Tokenize the top-level object to reject missing, duplicate, differently
	// cased or unknown fields; DisallowUnknownFields alone is case-insensitive.
	fields := map[string]bool{
		"version": false, "recipient_id": false, "sender_identity_key": false,
		"ephemeral_key": false, "signed_prekey_id": false, "one_time_prekey_id": false,
		"nonce": false, "ciphertext": false,
	}
	d := json.NewDecoder(bytes.NewBufferString(content))
	if token, err := d.Token(); err != nil || token != json.Delim('{') {
		return Envelope{}, ErrInvalidEnvelope
	}
	for d.More() {
		token, err := d.Token()
		name, ok := token.(string)
		seen, known := fields[name]
		if err != nil || !ok || !known || seen {
			return Envelope{}, ErrInvalidEnvelope
		}
		fields[name] = true
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil || (name != "one_time_prekey_id" && bytes.Equal(raw, []byte("null"))) {
			return Envelope{}, ErrInvalidEnvelope
		}
	}
	if token, err := d.Token(); err != nil || token != json.Delim('}') {
		return Envelope{}, ErrInvalidEnvelope
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return Envelope{}, ErrInvalidEnvelope
	}
	for _, seen := range fields {
		if !seen {
			return Envelope{}, ErrInvalidEnvelope
		}
	}
	var envelope Envelope
	if json.Unmarshal([]byte(content), &envelope) != nil || validateEnvelope(envelope) != nil {
		return Envelope{}, ErrInvalidEnvelope
	}
	return envelope, nil
}

func EncodeEnvelope(envelope Envelope) (string, error) {
	if err := validateEnvelope(envelope); err != nil {
		return "", err
	}
	content, err := json.Marshal(envelope)
	if err != nil || len(content) > 8192 {
		return "", ErrInvalidEnvelope
	}
	return string(content), nil
}

// Seal retains the v1 profile for regression tests. Application messages use
// CreateEpoch once, then SealMessage; the WASM bridge does not expose v1.
func Seal(ctx MessageContext, identity KeyPair, recipient Bundle, plaintext []byte) (Envelope, [32]byte, error) {
	if err := validateContext(ctx); err != nil || ctx.RecipientID != recipient.UserID {
		return Envelope{}, [32]byte{}, ErrInvalidContext
	}
	if err := validatePair(identity); err != nil {
		return Envelope{}, [32]byte{}, err
	}
	if err := validatePlaintext(plaintext); err != nil {
		return Envelope{}, [32]byte{}, err
	}
	if err := VerifyBundle(recipient); err != nil {
		return Envelope{}, [32]byte{}, err
	}
	ephemeral, err := GenerateKeyPair()
	if err != nil {
		return Envelope{}, [32]byte{}, err
	}
	recipientIK, _ := publicKey(recipient.IdentityPublicKey)
	spk, _ := publicKey(recipient.SignedPrekey.PublicKey)
	inputs := [][2][32]byte{{identity.Private, spk}, {ephemeral.Private, recipientIK}, {ephemeral.Private, spk}}
	envelope := Envelope{
		Version: 1, RecipientID: ctx.RecipientID,
		SenderIdentityKey: base64.StdEncoding.EncodeToString(identity.Public[:]),
		EphemeralKey:      base64.StdEncoding.EncodeToString(ephemeral.Public[:]),
		SignedPrekeyID:    recipient.SignedPrekey.KeyID,
	}
	if opk := recipient.OneTimePrekey; opk != nil {
		public, _ := publicKey(opk.PublicKey)
		inputs = append(inputs, [2][32]byte{ephemeral.Private, public})
		id := opk.KeyID
		envelope.OneTimePrekeyID = &id
	}
	key, err := deriveKey(inputs)
	if err != nil {
		return Envelope{}, [32]byte{}, err
	}
	aad, err := makeAAD(ctx, identity.Public, recipientIK, envelope)
	if err != nil {
		return Envelope{}, [32]byte{}, err
	}
	aead, err := newGCM(key)
	if err != nil {
		return Envelope{}, [32]byte{}, err
	}
	nonce := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return Envelope{}, [32]byte{}, ErrCrypto
	}
	envelope.Nonce = base64.StdEncoding.EncodeToString(nonce)
	envelope.Ciphertext = base64.StdEncoding.EncodeToString(aead.Seal(nil, nonce, plaintext, aad))
	return envelope, key, nil
}

func Open(ctx MessageContext, identity, signed KeyPair, oneTime *KeyPair, envelope Envelope) ([]byte, [32]byte, error) {
	if err := validateContext(ctx); err != nil || ctx.RecipientID != envelope.RecipientID {
		return nil, [32]byte{}, ErrInvalidContext
	}
	if err := validateEnvelope(envelope); err != nil {
		return nil, [32]byte{}, err
	}
	if validatePair(identity) != nil || validatePair(signed) != nil || (oneTime != nil && validatePair(*oneTime) != nil) {
		return nil, [32]byte{}, ErrInvalidKey
	}
	if (envelope.OneTimePrekeyID == nil) != (oneTime == nil) {
		return nil, [32]byte{}, ErrInvalidKey
	}
	senderIK, _ := publicKey(envelope.SenderIdentityKey)
	ephemeral, _ := publicKey(envelope.EphemeralKey)
	inputs := [][2][32]byte{{signed.Private, senderIK}, {identity.Private, ephemeral}, {signed.Private, ephemeral}}
	if oneTime != nil {
		inputs = append(inputs, [2][32]byte{oneTime.Private, ephemeral})
	}
	key, err := deriveKey(inputs)
	if err != nil {
		return nil, [32]byte{}, err
	}
	plaintext, err := DecryptWithKey(ctx, senderIK, identity.Public, key, envelope)
	if err != nil {
		return nil, [32]byte{}, err
	}
	return plaintext, key, nil
}

func DecryptWithKey(ctx MessageContext, senderIK, recipientIK, key [32]byte, envelope Envelope) ([]byte, error) {
	if err := validateContext(ctx); err != nil || ctx.RecipientID != envelope.RecipientID {
		return nil, ErrInvalidContext
	}
	if err := validateEnvelope(envelope); err != nil {
		return nil, err
	}
	actual, _ := publicKey(envelope.SenderIdentityKey)
	if actual != senderIK || ValidatePublicKey(senderIK) != nil || ValidatePublicKey(recipientIK) != nil {
		return nil, ErrInvalidKey
	}
	aad, err := makeAAD(ctx, senderIK, recipientIK, envelope)
	if err != nil {
		return nil, err
	}
	aead, err := newGCM(key)
	if err != nil {
		return nil, err
	}
	nonce, _ := decode64(envelope.Nonce, 12)
	ciphertext, _ := base64.StdEncoding.DecodeString(envelope.Ciphertext)
	plaintext, err := aead.Open(nil, nonce, ciphertext, aad)
	if err != nil {
		return nil, ErrDecrypt
	}
	if err := validatePlaintext(plaintext); err != nil {
		clear(plaintext)
		return nil, ErrDecrypt
	}
	return plaintext, nil
}

func validateContext(ctx MessageContext) error {
	for _, value := range []string{ctx.ThreadID, ctx.MessageID, ctx.SenderID, ctx.RecipientID} {
		if _, err := canonicalUUID(value); err != nil {
			return err
		}
	}
	return nil
}

func validateEnvelope(envelope Envelope) error {
	if envelope.Version != 1 || envelope.SignedPrekeyID <= 0 {
		return ErrInvalidEnvelope
	}
	if _, err := canonicalUUID(envelope.RecipientID); err != nil {
		return ErrInvalidEnvelope
	}
	if id := envelope.OneTimePrekeyID; id != nil && (*id <= 0 || *id == envelope.SignedPrekeyID) {
		return ErrInvalidEnvelope
	}
	if _, err := publicKey(envelope.SenderIdentityKey); err != nil {
		return ErrInvalidEnvelope
	}
	if _, err := publicKey(envelope.EphemeralKey); err != nil {
		return ErrInvalidEnvelope
	}
	if _, err := decode64(envelope.Nonce, 12); err != nil {
		return ErrInvalidEnvelope
	}
	ciphertext, err := base64.StdEncoding.Strict().DecodeString(envelope.Ciphertext)
	if err != nil || len(ciphertext) < 17 || len(ciphertext) > 4016 || base64.StdEncoding.EncodeToString(ciphertext) != envelope.Ciphertext {
		return ErrInvalidEnvelope
	}
	return nil
}

func makeAAD(ctx MessageContext, senderIK, recipientIK [32]byte, envelope Envelope) ([]byte, error) {
	aad := append(encodePublic(senderIK), encodePublic(recipientIK)...)
	aad = append(aad, []byte("Mini-Hermes/e2ee_v1\x00")...)
	for _, value := range []string{ctx.ThreadID, ctx.MessageID, ctx.SenderID, ctx.RecipientID} {
		id, err := canonicalUUID(value)
		if err != nil {
			return nil, err
		}
		aad = append(aad, id[:]...)
	}
	ephemeral, err := publicKey(envelope.EphemeralKey)
	if err != nil {
		return nil, err
	}
	aad = append(aad, encodePublic(ephemeral)...)
	aad = binary.BigEndian.AppendUint64(aad, uint64(envelope.SignedPrekeyID))
	var opk uint64
	if envelope.OneTimePrekeyID != nil {
		opk = uint64(*envelope.OneTimePrekeyID)
	}
	return binary.BigEndian.AppendUint64(aad, opk), nil
}
