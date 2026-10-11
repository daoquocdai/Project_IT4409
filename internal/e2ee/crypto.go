package e2ee

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"sync"
	"unicode/utf8"

	"github.com/google/uuid"
	"go.mau.fi/libsignal/ecc"
)

// ecc's default logger is lazily initialized without synchronization.
// Serialize its calls without configuring or enabling library logging.
var signatureMu sync.Mutex

var (
	ErrInvalidKey       = errors.New("invalid key")
	ErrInvalidBundle    = errors.New("invalid bundle")
	ErrInvalidContext   = errors.New("invalid message context")
	ErrInvalidEnvelope  = errors.New("invalid envelope")
	ErrInvalidPlaintext = errors.New("invalid plaintext")
	ErrDecrypt          = errors.New("decryption failed")
	ErrCrypto           = errors.New("crypto failed")
	ErrInvalidKDF       = errors.New("invalid password KDF profile")
	ErrInvalidVault     = errors.New("invalid encrypted vault or backup")
)

func GenerateKeyPair() (KeyPair, error) {
	private, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return KeyPair{}, ErrCrypto
	}
	var pair KeyPair
	copy(pair.Private[:], private.Bytes())
	copy(pair.Public[:], private.PublicKey().Bytes())
	return pair, nil
}

// An ECDH probe rejects every low-order point, including non-canonical aliases.
// The probe scalar is public, fixed and unrelated to any user's keys.
func ValidatePublicKey(public [32]byte) error {
	probe, _ := ecdh.X25519().NewPrivateKey(make([]byte, 32))
	peer, err := ecdh.X25519().NewPublicKey(public[:])
	if err != nil {
		return ErrInvalidKey
	}
	if _, err = probe.ECDH(peer); err != nil {
		return ErrInvalidKey
	}
	return nil
}

// SignPrekey uses libsignal's sign-bit signature variant, NOT canonical
// XEdDSA-2016 wire encoding. Only the type-prefixed public key is signed.
func SignPrekey(identityPrivate, signedPublic [32]byte) ([64]byte, error) {
	if err := ValidatePublicKey(signedPublic); err != nil {
		return [64]byte{}, err
	}
	signatureMu.Lock()
	defer signatureMu.Unlock()
	return ecc.CalculateSignature(ecc.NewDjbECPrivateKey(identityPrivate), encodePublic(signedPublic)), nil
}

func VerifyBundle(bundle Bundle) error {
	if _, err := canonicalUUID(bundle.UserID); err != nil {
		return ErrInvalidBundle
	}
	return verifyPrekeyBundle(bundle.IdentityPublicKey, bundle.SignedPrekey, bundle.OneTimePrekey)
}

func verifyPrekeyBundle(identityPublic string, signedPrekey SignedPrekey, oneTime *PublicPrekey) error {
	if signedPrekey.KeyID <= 0 {
		return ErrInvalidBundle
	}
	identity, err := publicKey(identityPublic)
	if err != nil {
		return ErrInvalidBundle
	}
	signed, err := publicKey(signedPrekey.PublicKey)
	if err != nil {
		return ErrInvalidBundle
	}
	signature, err := decode64(signedPrekey.Signature, 64)
	if err != nil {
		return ErrInvalidBundle
	}
	if !verifySignature(identity, signed, [64]byte(signature)) {
		return ErrInvalidBundle
	}
	if opk := oneTime; opk != nil {
		if opk.KeyID <= 0 || opk.KeyID == signedPrekey.KeyID {
			return ErrInvalidBundle
		}
		if _, err := publicKey(opk.PublicKey); err != nil {
			return ErrInvalidBundle
		}
	}
	return nil
}

func verifySignature(identity, signed [32]byte, signature [64]byte) bool {
	signatureMu.Lock()
	defer signatureMu.Unlock()
	return ecc.VerifySignature(ecc.NewDjbECPublicKey(identity), encodePublic(signed), signature)
}

func decode64(encoded string, length int) ([]byte, error) {
	if len(encoded) != base64.StdEncoding.EncodedLen(length) {
		return nil, ErrInvalidKey
	}
	decoded, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || len(decoded) != length || base64.StdEncoding.EncodeToString(decoded) != encoded {
		return nil, ErrInvalidKey
	}
	return decoded, nil
}

func publicKey(encoded string) ([32]byte, error) {
	decoded, err := decode64(encoded, 32)
	if err != nil {
		return [32]byte{}, err
	}
	public := [32]byte(decoded)
	return public, ValidatePublicKey(public)
}

func encodePublic(public [32]byte) []byte {
	return append([]byte{0x05}, public[:]...)
}

func validatePair(pair KeyPair) error {
	private, err := ecdh.X25519().NewPrivateKey(pair.Private[:])
	if err != nil || !bytes.Equal(private.PublicKey().Bytes(), pair.Public[:]) {
		return ErrInvalidKey
	}
	return ValidatePublicKey(pair.Public)
}

func canonicalUUID(value string) (uuid.UUID, error) {
	id, err := uuid.Parse(value)
	if err != nil || id == uuid.Nil || id.String() != value {
		return uuid.Nil, ErrInvalidContext
	}
	return id, nil
}

func validatePlaintext(plaintext []byte) error {
	count := utf8.RuneCount(plaintext)
	if !utf8.Valid(plaintext) || count < 1 || count > 1000 || bytes.IndexByte(plaintext, 0) >= 0 {
		return ErrInvalidPlaintext
	}
	return nil
}

func deriveKey(inputs [][2][32]byte) ([32]byte, error) {
	ikm := make([]byte, 32, 32+len(inputs)*32)
	for i := range ikm {
		ikm[i] = 0xff
	}
	defer func() { clear(ikm) }()
	for _, input := range inputs {
		private, err := ecdh.X25519().NewPrivateKey(input[0][:])
		if err != nil {
			return [32]byte{}, ErrInvalidKey
		}
		public, err := ecdh.X25519().NewPublicKey(input[1][:])
		if err != nil {
			return [32]byte{}, ErrInvalidKey
		}
		dh, err := private.ECDH(public)
		if err != nil {
			return [32]byte{}, ErrInvalidKey
		}
		ikm = append(ikm, dh...)
		clear(dh)
	}
	key, err := hkdf.Key(sha256.New, ikm, make([]byte, 32), "Mini-Hermes/X3DH/v1", 32)
	if err != nil {
		return [32]byte{}, ErrCrypto
	}
	defer clear(key)
	return [32]byte(key), nil
}

func newGCM(key [32]byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, ErrCrypto
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, ErrCrypto
	}
	return aead, nil
}
