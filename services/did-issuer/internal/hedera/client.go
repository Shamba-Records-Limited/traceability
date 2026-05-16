// Package hedera wraps the Hiero (formerly Hedera) Go SDK with the
// operations the issuer needs.
//
// The current real implementation only creates HCS topics and submits the
// initial DID document message. Updates and revocations will land alongside
// the W3C DID Update flow in a follow-up.
package hedera

import (
	"context"
	"log/slog"

	"github.com/Shamba-Records-Limited/traceability/services/did-issuer/internal/config"
)

// MintResult captures the protocol-level outcome of a DID-mint call.
type MintResult struct {
	DID                string `json:"did"`
	TopicID            string `json:"topicId"`
	TransactionID      string `json:"transactionId"`
	ConsensusTimestamp string `json:"consensusTimestamp"`
	DocumentVersion    int    `json:"documentVersion"`
}

// Client is the operations surface the issuer exposes against Hedera.
type Client interface {
	// Mode returns "real" or "mock".
	Mode() string

	// Network returns the configured Hedera network (testnet, previewnet, mainnet).
	Network() config.Network

	// MintDID creates an HCS topic, submits the supplied DID document as the
	// first message, and returns the resulting did:hedera identifier.
	MintDID(ctx context.Context, actorID string, documentJSON []byte) (MintResult, error)

	// Close releases any held resources.
	Close() error
}

// NewClient returns the appropriate client implementation based on configuration.
// In mock mode the returned client never contacts the network.
func NewClient(cfg *config.Config, logger *slog.Logger) (Client, error) {
	if cfg.MockMode {
		logger.Warn("did-issuer hedera client running in mock mode; no real network calls will be made")
		return newMockClient(cfg), nil
	}
	return newSDKClient(cfg, logger)
}
