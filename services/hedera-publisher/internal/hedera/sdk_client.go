package hedera

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

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
//
// Every write fetches the transaction record (not just the receipt) so the
// caller receives the real consensus timestamp the network assigned. The
// extra record query costs a small additional fee (~$0.0001 USD) and is the
// correct primitive for audit-trail accuracy.
type sdkClient struct {
	cfg         *config.Config
	logger      *slog.Logger
	client      *hiero.Client
	operatorID  hiero.AccountID
	operatorKey hiero.PrivateKey
	treasuryID  hiero.AccountID
	treasuryKey hiero.PrivateKey
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

	treasuryID, err := hiero.AccountIDFromString(cfg.TreasuryID)
	if err != nil {
		return nil, fmt.Errorf("parse treasury id %q: %w", cfg.TreasuryID, err)
	}
	treasuryKey, err := hiero.PrivateKeyFromString(cfg.TreasuryPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("parse treasury private key: %w", err)
	}

	logger.Info("hedera SDK client ready",
		"network", string(cfg.Network),
		"operator", cfg.OperatorID,
		"treasury", cfg.TreasuryID,
	)

	return &sdkClient{
		cfg:         cfg,
		logger:      logger,
		client:      hClient,
		operatorID:  operatorID,
		operatorKey: operatorKey,
		treasuryID:  treasuryID,
		treasuryKey: treasuryKey,
	}, nil
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
	record, err := resp.SetValidateStatus(true).GetRecord(c.client)
	if err != nil {
		return SubmitMessageResult{}, fmt.Errorf("submit message record: %w", err)
	}

	return SubmitMessageResult{
		TopicID:            tid.String(),
		SequenceNumber:     int64(record.Receipt.TopicSequenceNumber),
		ConsensusTimestamp: record.ConsensusTimestamp.UTC().Format(time.RFC3339Nano),
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

	// Both admin and submit keys are set to the operator public key. Without
	// the admin key, an HCS topic is immutable — its memo, keys, and expiry
	// could never be updated — which is incompatible with operational reality
	// (we need to be able to rotate keys, change the auto-renew account, and
	// extend expiries over the lifetime of a long-lived batch topic).
	createResp, err := hiero.NewTopicCreateTransaction().
		SetAdminKey(c.client.GetOperatorPublicKey()).
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
	record, err := resp.SetValidateStatus(true).GetRecord(c.client)
	if err != nil {
		return MintNFTResult{}, fmt.Errorf("mint nft record: %w", err)
	}
	if len(record.Receipt.SerialNumbers) == 0 {
		return MintNFTResult{}, errors.New("mint nft receipt did not include a serial number")
	}

	return MintNFTResult{
		TokenID:       tid.String(),
		SerialNumber:  record.Receipt.SerialNumbers[0],
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
		SetTreasuryAccountID(c.treasuryID).
		SetAdminKey(c.client.GetOperatorPublicKey()).
		SetSupplyKey(c.client.GetOperatorPublicKey()).
		FreezeWith(c.client)
	if err != nil {
		return hiero.TokenID{}, fmt.Errorf("freeze token create: %w", err)
	}
	// Treasury must sign because it is the designated treasury account on the
	// new collection. The operator signs implicitly via Execute as payer.
	resp, err := tx.Sign(c.treasuryKey).Execute(c.client)
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
	tx, err := hiero.NewTransferTransaction().
		AddNftTransfer(nftID, from, to).
		FreezeWith(c.client)
	if err != nil {
		return TxResult{}, fmt.Errorf("freeze transfer: %w", err)
	}

	// Sender signature requirements:
	//   - When the sender is the operator (the payer), Execute signs implicitly.
	//   - When the sender is the treasury, sign explicitly with the treasury key.
	//   - Any other sender is not currently supported; the BFF should ensure
	//     the sender is either the operator or the treasury account, and add
	//     additional signers in a follow-up when we wire user-custody.
	switch {
	case from.Equals(c.operatorID):
		// no-op; payer signs on Execute.
	case from.Equals(c.treasuryID):
		tx = tx.Sign(c.treasuryKey)
	default:
		return TxResult{}, fmt.Errorf("transfer requires sender signature but sender %s is neither operator nor treasury", from.String())
	}

	resp, err := tx.Execute(c.client)
	if err != nil {
		return TxResult{}, fmt.Errorf("transfer nft: %w", err)
	}
	record, err := resp.SetValidateStatus(true).GetRecord(c.client)
	if err != nil {
		return TxResult{}, fmt.Errorf("transfer nft record: %w", err)
	}

	return TxResult{
		TransactionID:      resp.TransactionID.String(),
		ConsensusTimestamp: record.ConsensusTimestamp.UTC().Format(time.RFC3339Nano),
	}, nil
}

// ExecuteContract invokes `functionSelector(args...)` on the supplied contract
// via the native Hedera SDK's ContractExecuteTransaction. We use the SDK path
// instead of the JSON-RPC relay because (a) we already pay for an operator
// account in HBAR and the SDK shares signing with HCS/HTS, (b) the SDK gives
// us a real consensus timestamp and Hedera transaction id that joins cleanly
// against the rest of the audit trail.
//
// `contractID` accepts both Hedera's `0.0.<num>` form and a 0x-prefixed EVM
// address; the SDK's ContractID parser handles either. `args` MUST be
// ABI-encoded by the caller — the publisher does not own ABI knowledge.
func (c *sdkClient) ExecuteContract(ctx context.Context, contractID, functionSelector string, args []byte, gasLimit int64) (ContractCallResult, error) {
	if err := ctx.Err(); err != nil {
		return ContractCallResult{}, err
	}
	if contractID == "" {
		return ContractCallResult{}, errors.New("contractID is required")
	}
	if functionSelector == "" {
		return ContractCallResult{}, errors.New("functionSelector is required")
	}
	if gasLimit <= 0 {
		// Hedera's contract calls require a non-trivial gas limit. 500k is a
		// safe default for the simple append-only writes our registry
		// contracts do; complex calls should pass their own ceiling.
		gasLimit = 500_000
	}

	cid, err := hiero.ContractIDFromString(contractID)
	if err != nil {
		return ContractCallResult{}, fmt.Errorf("parse contract id %q: %w", contractID, err)
	}

	// The Hedera SDK's `SetFunction` ABI-encodes a function-selector + params
	// pair for us via `ContractFunctionParameters`, but our registry writes
	// already have an ABI-encoded body coming from the web service (which
	// owns the type definitions). Use `SetFunctionParameters` instead so the
	// publisher stays ABI-agnostic and the web side stays the source of
	// truth for the contract surface.
	functionBody := append(functionSelectorBytes(functionSelector), args...)
	resp, err := hiero.NewContractExecuteTransaction().
		SetContractID(cid).
		SetGas(uint64(gasLimit)).
		SetFunctionParameters(functionBody).
		Execute(c.client)
	if err != nil {
		return ContractCallResult{}, fmt.Errorf("execute contract: %w", err)
	}
	record, err := resp.SetValidateStatus(true).GetRecord(c.client)
	if err != nil {
		return ContractCallResult{}, fmt.Errorf("execute contract record: %w", err)
	}

	// `GasUsed` is informational; the Hedera SDK exposes the contract result
	// via a separate `GetContractExecuteResult` query that costs another
	// fee. Skip it for now — the publisher's caller already has the
	// gas-paid signal from the operator's HBAR balance dashboards.
	return ContractCallResult{
		ContractID:         cid.String(),
		TransactionID:      resp.TransactionID.String(),
		ConsensusTimestamp: record.ConsensusTimestamp.UTC().Format(time.RFC3339Nano),
		GasUsed:            0,
	}, nil
}

// functionSelectorBytes parses a 0x-prefixed 4-byte hex selector ("0xa1b2c3d4")
// and returns the raw 4 bytes. Used by ExecuteContract to prepend the
// Solidity function selector to the caller-supplied ABI-encoded params.
func functionSelectorBytes(selector string) []byte {
	s := selector
	if len(s) >= 2 && (s[:2] == "0x" || s[:2] == "0X") {
		s = s[2:]
	}
	out := make([]byte, len(s)/2)
	for i := 0; i+1 < len(s); i += 2 {
		var b byte
		for j := 0; j < 2; j++ {
			c := s[i+j]
			var nibble byte
			switch {
			case c >= '0' && c <= '9':
				nibble = c - '0'
			case c >= 'a' && c <= 'f':
				nibble = c - 'a' + 10
			case c >= 'A' && c <= 'F':
				nibble = c - 'A' + 10
			default:
				return nil
			}
			b = (b << 4) | nibble
		}
		out[i/2] = b
	}
	return out
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
