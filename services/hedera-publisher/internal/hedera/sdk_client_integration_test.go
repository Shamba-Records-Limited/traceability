package hedera

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/config"
)

// integrationEnvVars lists every environment variable that must be set for the
// integration tests in this file to run. Matches what config.Load() requires
// when MockMode is false, so a passing skip check guarantees that the
// subsequent config.Load() will succeed.
var integrationEnvVars = []string{
	"HEDERA_OPERATOR_ID",
	"HEDERA_OPERATOR_PRIVATE_KEY",
	"HEDERA_TREASURY_ID",
	"HEDERA_TREASURY_PRIVATE_KEY",
}

// skipUnlessIntegration centralises the preflight check used by every
// integration test in this package. We skip — never fail — when the toggle or
// any required credential is missing, so the standard `go test ./...` run on
// any developer machine remains green without testnet access.
func skipUnlessIntegration(t *testing.T) (*config.Config, Client) {
	t.Helper()
	if os.Getenv("HEDERA_INTEGRATION") != "1" {
		t.Skip("set HEDERA_INTEGRATION=1 to run hedera integration tests")
	}
	for _, key := range integrationEnvVars {
		if os.Getenv(key) == "" {
			t.Skipf("%s must be set for hedera integration tests", key)
		}
	}

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config load: %v", err)
	}
	if cfg.MockMode {
		t.Fatal("expected real client; got mock mode")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError}))
	client, err := NewClient(cfg, logger)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })

	if got := client.Mode(); got != "real" {
		t.Fatalf("expected mode 'real', got %q", got)
	}
	return cfg, client
}

// TestIntegrationSDKClient_SubmitMessage exercises the HCS path: creates a
// fresh topic and submits a single message, asserting that the receipt and
// record both come back populated. No cleanup is performed — testnet topics
// expire naturally.
func TestIntegrationSDKClient_SubmitMessage(t *testing.T) {
	_, client := skipUnlessIntegration(t)

	payload, err := json.Marshal(map[string]any{
		"test":      "integration",
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	result, err := client.SubmitMessage(ctx, "", payload)
	if err != nil {
		t.Fatalf("submit message: %v", err)
	}
	if result.TopicID == "" {
		t.Errorf("expected topic id, got empty string")
	}
	if result.TransactionID == "" {
		t.Errorf("expected transaction id, got empty string")
	}
	if result.ConsensusTimestamp == "" {
		t.Errorf("expected consensus timestamp, got empty string")
	}
	if result.SequenceNumber <= 0 {
		t.Errorf("expected positive sequence number, got %d", result.SequenceNumber)
	}
	t.Logf("submitted to %s seq=%d consensus=%s tx=%s",
		result.TopicID, result.SequenceNumber, result.ConsensusTimestamp, result.TransactionID)
}

// TestIntegrationSDKClient_MintNFT exercises the HTS NFT path: creates a fresh
// non-fungible collection (treasury-signed) and mints a single NFT against it.
// The same flow exercises the treasury-signing logic that handoffs depend on,
// so a green run here is the strongest local signal that real mode works.
func TestIntegrationSDKClient_MintNFT(t *testing.T) {
	_, client := skipUnlessIntegration(t)

	metadata, err := json.Marshal(map[string]any{
		"test":      "integration",
		"commodity": "coffee",
		"lot":       time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("marshal metadata: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	result, err := client.MintNFT(ctx, "", "Shamba Integration", "SHMBI", metadata)
	if err != nil {
		t.Fatalf("mint nft: %v", err)
	}
	if result.TokenID == "" {
		t.Errorf("expected token id, got empty string")
	}
	if result.SerialNumber <= 0 {
		t.Errorf("expected positive serial number, got %d", result.SerialNumber)
	}
	if result.TransactionID == "" {
		t.Errorf("expected transaction id, got empty string")
	}
	t.Logf("minted %s serial=%d tx=%s", result.TokenID, result.SerialNumber, result.TransactionID)
}
