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

// TestIntegrationSDKClient_SubmitMessage runs an end-to-end check against the
// configured Hedera network. It is skipped unless:
//
//	HEDERA_INTEGRATION=1
//	HEDERA_OPERATOR_ID and HEDERA_OPERATOR_PRIVATE_KEY are set
//
// The test creates a fresh HCS topic and submits a single message. It is the
// minimum viable confidence check that the real SDK client correctly signs and
// reaches a node. Network and crypto are real; no cleanup is performed on the
// created topic — testnet topics expire naturally.
func TestIntegrationSDKClient_SubmitMessage(t *testing.T) {
	if os.Getenv("HEDERA_INTEGRATION") != "1" {
		t.Skip("set HEDERA_INTEGRATION=1 to run this test")
	}
	if os.Getenv("HEDERA_OPERATOR_ID") == "" || os.Getenv("HEDERA_OPERATOR_PRIVATE_KEY") == "" {
		t.Skip("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_PRIVATE_KEY must be set for integration tests")
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

	payload, err := json.Marshal(map[string]any{
		"test":      "integration",
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
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
	if result.SequenceNumber <= 0 {
		t.Errorf("expected positive sequence number, got %d", result.SequenceNumber)
	}
	t.Logf("submitted message to %s seq=%d tx=%s", result.TopicID, result.SequenceNumber, result.TransactionID)
}
