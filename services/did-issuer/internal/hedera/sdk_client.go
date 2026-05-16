package hedera

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	hiero "github.com/hiero-ledger/hiero-sdk-go/v2/sdk"

	"github.com/Shamba-Records-Limited/traceability/services/did-issuer/internal/config"
)

// sdkClient is a Client implementation backed by the Hiero Go SDK.
//
// Each MintDID call creates a dedicated HCS topic (admin/submit keys set to
// the operator public key) and submits the supplied DID document as the
// topic's first message. The returned `did` is `did:hedera:<network>:<topic>`
// per the Hiero DID method specification.
type sdkClient struct {
	cfg    *config.Config
	logger *slog.Logger
	client *hiero.Client
}

func newSDKClient(cfg *config.Config, logger *slog.Logger) (Client, error) {
	hClient, err := clientForNetwork(cfg.Network)
	if err != nil {
		return nil, err
	}

	operatorID, err := hiero.AccountIDFromString(cfg.OperatorID)
	if err != nil {
		return nil, fmt.Errorf("parse operator id %q: %w", cfg.OperatorID, err)
	}
	operatorKey, err := hiero.PrivateKeyFromString(cfg.OperatorPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("parse operator private key: %w", err)
	}
	hClient.SetOperator(operatorID, operatorKey)

	logger.Info("did-issuer hedera SDK client ready",
		"network", string(cfg.Network),
		"operator", cfg.OperatorID,
	)

	return &sdkClient{cfg: cfg, logger: logger, client: hClient}, nil
}

func clientForNetwork(n config.Network) (*hiero.Client, error) {
	switch n {
	case config.NetworkTestnet:
		return hiero.ClientForTestnet(), nil
	case config.NetworkPreviewnet:
		return hiero.ClientForPreviewnet(), nil
	case config.NetworkMainnet:
		return hiero.ClientForMainnet(), nil
	default:
		return nil, fmt.Errorf("unsupported hedera network %q", n)
	}
}

func (c *sdkClient) Mode() string            { return "real" }
func (c *sdkClient) Network() config.Network { return c.cfg.Network }

func (c *sdkClient) MintDID(ctx context.Context, actorID string, documentJSON []byte) (MintResult, error) {
	if err := ctx.Err(); err != nil {
		return MintResult{}, err
	}
	if actorID == "" {
		return MintResult{}, errors.New("actorId is required")
	}
	if len(documentJSON) == 0 {
		return MintResult{}, errors.New("documentJSON is required")
	}

	// 1. Create a dedicated HCS topic for the DID. Admin + submit keys are
	//    both the operator public key so the topic remains mutable (key
	//    rotation, memo update) over its lifetime — see ADR-0002 + the
	//    earlier publisher-service review.
	createResp, err := hiero.NewTopicCreateTransaction().
		SetAdminKey(c.client.GetOperatorPublicKey()).
		SetSubmitKey(c.client.GetOperatorPublicKey()).
		SetTopicMemo("shamba did:hedera document topic for actor " + actorID).
		Execute(c.client)
	if err != nil {
		return MintResult{}, fmt.Errorf("create did topic: %w", err)
	}
	createReceipt, err := createResp.SetValidateStatus(true).GetReceipt(c.client)
	if err != nil {
		return MintResult{}, fmt.Errorf("create did topic receipt: %w", err)
	}
	if createReceipt.TopicID == nil {
		return MintResult{}, errors.New("create did topic returned a receipt without a topic id")
	}
	topicID := *createReceipt.TopicID

	// 2. Submit the initial DID document as message #1 on the topic.
	submitResp, err := hiero.NewTopicMessageSubmitTransaction().
		SetTopicID(topicID).
		SetMessage(documentJSON).
		Execute(c.client)
	if err != nil {
		return MintResult{}, fmt.Errorf("submit did document: %w", err)
	}
	submitRecord, err := submitResp.SetValidateStatus(true).GetRecord(c.client)
	if err != nil {
		return MintResult{}, fmt.Errorf("submit did document record: %w", err)
	}

	return MintResult{
		DID:                fmt.Sprintf("did:hedera:%s:%s", c.cfg.Network, topicID.String()),
		TopicID:            topicID.String(),
		TransactionID:      submitResp.TransactionID.String(),
		ConsensusTimestamp: submitRecord.ConsensusTimestamp.UTC().Format(time.RFC3339Nano),
		DocumentVersion:    1,
	}, nil
}

func (c *sdkClient) Close() error {
	if c.client == nil {
		return nil
	}
	if err := c.client.Close(); err != nil {
		return fmt.Errorf("hedera client close: %w", err)
	}
	return nil
}

// Compile-time sanity check that sdkClient satisfies the Client interface.
var _ Client = (*sdkClient)(nil)
