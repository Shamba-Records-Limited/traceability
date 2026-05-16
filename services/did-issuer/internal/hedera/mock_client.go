package hedera

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/Shamba-Records-Limited/traceability/services/did-issuer/internal/config"
)

// mockClient returns deterministic-looking results without touching the
// network. Topic IDs come from a counter; transaction IDs encode the SHA-256
// prefix of the supplied document so identical inputs produce identical IDs.
type mockClient struct {
	cfg     *config.Config
	topicSeq atomic.Int64
}

func newMockClient(cfg *config.Config) Client { return &mockClient{cfg: cfg} }

func (m *mockClient) Mode() string             { return "mock" }
func (m *mockClient) Network() config.Network  { return m.cfg.Network }

func (m *mockClient) MintDID(_ context.Context, actorID string, documentJSON []byte) (MintResult, error) {
	if actorID == "" {
		return MintResult{}, fmt.Errorf("actorId is required")
	}
	if len(documentJSON) == 0 {
		return MintResult{}, fmt.Errorf("documentJSON is required")
	}

	topicNum := 7_000_000 + m.topicSeq.Add(1)
	topicID := "0.0." + strconv.FormatInt(topicNum, 10)

	hash := sha256.Sum256(documentJSON)
	txID := "mock-tx-" + hex.EncodeToString(hash[:8])

	return MintResult{
		DID:                fmt.Sprintf("did:hedera:%s:%s", m.cfg.Network, topicID),
		TopicID:            topicID,
		TransactionID:      txID,
		ConsensusTimestamp: time.Now().UTC().Format(time.RFC3339Nano),
		DocumentVersion:    1,
	}, nil
}

func (m *mockClient) Close() error { return nil }
