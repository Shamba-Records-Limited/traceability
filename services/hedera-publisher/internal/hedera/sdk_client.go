package hedera

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	hiero "github.com/hiero-ledger/hiero-sdk-go/v2/sdk"

	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/config"
)

// sdkClient is a Client implementation backed by the Hiero (formerly Hedera)
// Go SDK. It targets the network selected in configuration and signs every
// transaction with the configured operator key.
//
// All public methods accept a context but the underlying SDK does not yet
// propagate it into the gRPC call; we still check ctx.Err() before kicking
// off each transaction so callers can cancel queued work.
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

	logger.Info("hedera SDK client ready",
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

func (c *sdkClient) Mode() string { return "real" }

func (c *sdkClient) SubmitMessage(ctx context.Context, topicID string, payload []byte) (SubmitMessageResult, error) {
	if err := ctx.Err(); err != nil {
		return SubmitMessageResult{}, err
	}
	if len(payload) == 0 {
		return SubmitMessageResult{}, errors.New("payload must not be empty")
	}

	tid, err := c.resolveOrCreateTopic(ctx, topicID)
	if err != nil {
		return SubmitMessageResult{}, err
	}

	resp, err := hiero.NewTopicMessageSubmitTransaction().
		SetTopicID(tid).
		SetMessage(payload).
		Execute(c.client)
	if err != nil {
		return SubmitMessageResult{}, fmt.Errorf("submit message: %w", err)
	}
	receipt, err := resp.SetValidateStatus(true).GetReceipt(c.client)
	if err != nil {
		return SubmitMessageResult{}, fmt.Errorf("submit message receipt: %w", err)
	}

	return SubmitMessageResult{
		TopicID:            tid.String(),
		SequenceNumber:     int64(receipt.TopicSequenceNumber),
		ConsensusTimestamp: resp.TransactionID.ValidStart.UTC().Format("2006-01-02T15:04:05.000000000Z07:00"),
		TransactionID:      resp.TransactionID.String(),
	}, nil
}

func (c *sdkClient) resolveOrCreateTopic(ctx context.Context, topicID string) (hiero.TopicID, error) {
	if topicID != "" {
		parsed, err := hiero.TopicIDFromString(topicID)
		if err != nil {
			return hiero.TopicID{}, fmt.Errorf("parse topic id %q: %w", topicID, err)
		}
		return parsed, nil
	}
	if err := ctx.Err(); err != nil {
		return hiero.TopicID{}, err
	}

	createResp, err := hiero.NewTopicCreateTransaction().
		SetSubmitKey(c.client.GetOperatorPublicKey()).
		SetTopicMemo("shamba-traceability batch topic").
		Execute(c.client)
	if err != nil {
		return hiero.TopicID{}, fmt.Errorf("create topic: %w", err)
	}
	receipt, err := createResp.SetValidateStatus(true).GetReceipt(c.client)
	if err != nil {
		return hiero.TopicID{}, fmt.Errorf("create topic receipt: %w", err)
	}
	if receipt.TopicID == nil {
		return hiero.TopicID{}, errors.New("create topic returned a receipt without a topic id")
	}
	return *receipt.TopicID, nil
}

func (c *sdkClient) MintNFT(ctx context.Context, tokenID, name, symbol string, metadata []byte) (MintNFTResult, error) {
	if err := ctx.Err(); err != nil {
		return MintNFTResult{}, err
	}
	if len(metadata) == 0 {
		return MintNFTResult{}, errors.New("metadata must not be empty")
	}

	tid, err := c.resolveOrCreateCollection(ctx, tokenID, name, symbol)
	if err != nil {
		return MintNFTResult{}, err
	}

	resp, err := hiero.NewTokenMintTransaction().
		SetTokenID(tid).
		SetMetadata(metadata).
		Execute(c.client)
	if err != nil {
		return MintNFTResult{}, fmt.Errorf("mint nft: %w", err)
	}
	receipt, err := resp.SetValidateStatus(true).GetReceipt(c.client)
	if err != nil {
		return MintNFTResult{}, fmt.Errorf("mint nft receipt: %w", err)
	}
	if len(receipt.SerialNumbers) == 0 {
		return MintNFTResult{}, errors.New("mint nft receipt did not include a serial number")
	}

	return MintNFTResult{
		TokenID:       tid.String(),
		SerialNumber:  receipt.SerialNumbers[0],
		TransactionID: resp.TransactionID.String(),
	}, nil
}

func (c *sdkClient) resolveOrCreateCollection(ctx context.Context, tokenID, name, symbol string) (hiero.TokenID, error) {
	if tokenID != "" {
		parsed, err := hiero.TokenIDFromString(tokenID)
		if err != nil {
			return hiero.TokenID{}, fmt.Errorf("parse token id %q: %w", tokenID, err)
		}
		return parsed, nil
	}
	if err := ctx.Err(); err != nil {
		return hiero.TokenID{}, err
	}

	treasuryID, err := hiero.AccountIDFromString(c.cfg.TreasuryID)
	if err != nil {
		return hiero.TokenID{}, fmt.Errorf("parse treasury id %q: %w", c.cfg.TreasuryID, err)
	}
	treasuryKey, err := hiero.PrivateKeyFromString(c.cfg.TreasuryPrivateKey)
	if err != nil {
		return hiero.TokenID{}, fmt.Errorf("parse treasury private key: %w", err)
	}

	if name == "" {
		name = "Shamba Lot"
	}
	if symbol == "" {
		symbol = "SHAMBA"
	}

	tx, err := hiero.NewTokenCreateTransaction().
		SetTokenName(name).
		SetTokenSymbol(symbol).
		SetTokenType(hiero.TokenTypeNonFungibleUnique).
		SetSupplyType(hiero.TokenSupplyTypeInfinite).
		SetTreasuryAccountID(treasuryID).
		SetAdminKey(c.client.GetOperatorPublicKey()).
		SetSupplyKey(c.client.GetOperatorPublicKey()).
		FreezeWith(c.client)
	if err != nil {
		return hiero.TokenID{}, fmt.Errorf("freeze token create: %w", err)
	}
	resp, err := tx.Sign(treasuryKey).Execute(c.client)
	if err != nil {
		return hiero.TokenID{}, fmt.Errorf("create token collection: %w", err)
	}
	receipt, err := resp.SetValidateStatus(true).GetReceipt(c.client)
	if err != nil {
		return hiero.TokenID{}, fmt.Errorf("create token receipt: %w", err)
	}
	if receipt.TokenID == nil {
		return hiero.TokenID{}, errors.New("create token returned a receipt without a token id")
	}
	return *receipt.TokenID, nil
}

func (c *sdkClient) TransferNFT(ctx context.Context, tokenID string, serial int64, fromAccount, toAccount string) (TxResult, error) {
	if err := ctx.Err(); err != nil {
		return TxResult{}, err
	}
	tid, err := hiero.TokenIDFromString(tokenID)
	if err != nil {
		return TxResult{}, fmt.Errorf("parse token id %q: %w", tokenID, err)
	}
	from, err := hiero.AccountIDFromString(fromAccount)
	if err != nil {
		return TxResult{}, fmt.Errorf("parse from account %q: %w", fromAccount, err)
	}
	to, err := hiero.AccountIDFromString(toAccount)
	if err != nil {
		return TxResult{}, fmt.Errorf("parse to account %q: %w", toAccount, err)
	}

	nftID := hiero.NftID{TokenID: tid, SerialNumber: serial}
	resp, err := hiero.NewTransferTransaction().
		AddNftTransfer(nftID, from, to).
		Execute(c.client)
	if err != nil {
		return TxResult{}, fmt.Errorf("transfer nft: %w", err)
	}
	if _, err := resp.SetValidateStatus(true).GetReceipt(c.client); err != nil {
		return TxResult{}, fmt.Errorf("transfer nft receipt: %w", err)
	}

	return TxResult{
		TransactionID:      resp.TransactionID.String(),
		ConsensusTimestamp: resp.TransactionID.ValidStart.UTC().Format("2006-01-02T15:04:05.000000000Z07:00"),
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
