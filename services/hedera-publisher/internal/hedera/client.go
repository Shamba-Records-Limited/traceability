// Package hedera wraps the Hedera SDK with the operations the publisher needs.
//
// The current implementation is a mock: it returns deterministic-looking IDs
// and transaction hashes without performing any network calls. A real SDK
// adapter will replace this in a follow-up PR; the public interface here is
// shaped to absorb that change without churn at the call sites.
package hedera

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/config"
)

// Client is the operations surface the publisher exposes against Hedera.
type Client interface {
	// Mode returns "real" or "mock".
	Mode() string

	// SubmitMessage writes a single message to an HCS topic. If topicID is
	// empty, a new topic is created.
	SubmitMessage(ctx context.Context, topicID string, payload []byte) (SubmitMessageResult, error)

	// MintNFT mints a single NFT with `metadata` under the given collection token.
	// If tokenID is empty, a new collection is created with the supplied symbol/name.
	MintNFT(ctx context.Context, tokenID, name, symbol string, metadata []byte) (MintNFTResult, error)

	// TransferNFT transfers ownership of a serial-numbered NFT from sender to receiver.
	TransferNFT(ctx context.Context, tokenID string, serial int64, fromAccount, toAccount string) (TxResult, error)

	// ExecuteContract invokes `functionSelector` on the supplied Hedera contract,
	// passing the already-ABI-encoded `args` bytes. Returns the transaction id
	// + consensus timestamp; the deployed contract's emitted events are read
	// off the mirror node by the integrating client (we don't surface them
	// here because gas-cost-of-record varies per contract and the publisher
	// stays single-shot).
	//
	// `contractID` accepts Hedera's `0.0.<num>` form OR a 0x-prefixed EVM
	// address; the implementation translates as needed.
	ExecuteContract(ctx context.Context, contractID, functionSelector string, args []byte, gasLimit int64) (ContractCallResult, error)

	// Close releases any held resources.
	Close() error
}

// SubmitMessageResult captures the protocol-level outcome of an HCS submission.
type SubmitMessageResult struct {
	TopicID            string `json:"topicId"`
	SequenceNumber     int64  `json:"sequenceNumber"`
	ConsensusTimestamp string `json:"consensusTimestamp"`
	TransactionID      string `json:"transactionId"`
}

// MintNFTResult captures the outcome of a mint operation.
type MintNFTResult struct {
	TokenID       string `json:"tokenId"`
	SerialNumber  int64  `json:"serialNumber"`
	TransactionID string `json:"transactionId"`
}

// TxResult is the minimal result returned by simple transactions.
type TxResult struct {
	TransactionID      string `json:"transactionId"`
	ConsensusTimestamp string `json:"consensusTimestamp"`
}

// ContractCallResult is returned by ExecuteContract. `GasUsed` is informational
// and reflects the network's reported gas consumption; the publisher does not
// charge it back to the caller because the operator account pays.
type ContractCallResult struct {
	ContractID         string `json:"contractId"`
	TransactionID      string `json:"transactionId"`
	ConsensusTimestamp string `json:"consensusTimestamp"`
	GasUsed            int64  `json:"gasUsed"`
}

// NewClient returns the appropriate client implementation based on configuration.
// In mock mode the returned client never contacts the network.
func NewClient(cfg *config.Config, logger *slog.Logger) (Client, error) {
	if cfg.MockMode {
		logger.Warn("hedera client running in mock mode; no real network calls will be made")
		return newMockClient(), nil
	}
	return newSDKClient(cfg, logger)
}

// --- mock client ----------------------------------------------------------

type mockClient struct {
	topicSeq atomic.Int64
	mintSeq  atomic.Int64
	txSeq    atomic.Int64
}

func newMockClient() Client { return &mockClient{} }

func (m *mockClient) Mode() string { return "mock" }

func (m *mockClient) SubmitMessage(_ context.Context, topicID string, payload []byte) (SubmitMessageResult, error) {
	if topicID == "" {
		topicID = "0.0." + strconv.FormatInt(1_000_000+m.topicSeq.Add(1), 10)
	}
	hash := sha256.Sum256(payload)
	return SubmitMessageResult{
		TopicID:            topicID,
		SequenceNumber:     m.topicSeq.Add(1),
		ConsensusTimestamp: time.Now().UTC().Format(time.RFC3339Nano),
		TransactionID:      "mock-tx-" + hex.EncodeToString(hash[:8]),
	}, nil
}

func (m *mockClient) MintNFT(_ context.Context, tokenID, _, _ string, metadata []byte) (MintNFTResult, error) {
	if tokenID == "" {
		tokenID = "0.0." + strconv.FormatInt(2_000_000+m.mintSeq.Add(1), 10)
	}
	hash := sha256.Sum256(metadata)
	return MintNFTResult{
		TokenID:       tokenID,
		SerialNumber:  m.mintSeq.Add(1),
		TransactionID: "mock-tx-" + hex.EncodeToString(hash[:8]),
	}, nil
}

func (m *mockClient) TransferNFT(_ context.Context, _ string, _ int64, _, _ string) (TxResult, error) {
	id := "mock-tx-" + strconv.FormatInt(m.txSeq.Add(1), 10)
	return TxResult{
		TransactionID:      id,
		ConsensusTimestamp: time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}

func (m *mockClient) ExecuteContract(_ context.Context, contractID, _ string, args []byte, _ int64) (ContractCallResult, error) {
	hash := sha256.Sum256(args)
	if contractID == "" {
		// Mirror the real SDK's behaviour: an explicit contract id is required.
		// Returning an error keeps mock + real parity instead of papering over
		// the misuse with a synthetic id.
		return ContractCallResult{}, fmt.Errorf("contractID is required")
	}
	return ContractCallResult{
		ContractID:         contractID,
		TransactionID:      "mock-tx-" + hex.EncodeToString(hash[:8]),
		ConsensusTimestamp: time.Now().UTC().Format(time.RFC3339Nano),
		GasUsed:            50_000,
	}, nil
}

func (m *mockClient) Close() error { return nil }
