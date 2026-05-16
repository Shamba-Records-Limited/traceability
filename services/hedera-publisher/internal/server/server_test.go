package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/config"
	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/hedera"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	cfg := &config.Config{Network: config.NetworkTestnet, HTTPPort: "8080", LogLevel: "error", MockMode: true}
	logger := slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError}))
	client, err := hedera.NewClient(cfg, logger)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return New(cfg, logger, client)
}

func TestHealthReady(t *testing.T) {
	srv := newTestServer(t)

	for _, path := range []string{"/healthz", "/readyz"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s expected 200, got %d", path, rec.Code)
		}
	}
}

func TestPublishEventMock(t *testing.T) {
	srv := newTestServer(t)

	body, _ := json.Marshal(map[string]any{
		"payload": map[string]string{"type": "batch_created", "batchId": "abc"},
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/events", bytes.NewReader(body))
	req = req.WithContext(context.Background())
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var out hedera.SubmitMessageResult
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.TopicID == "" || out.TransactionID == "" {
		t.Fatalf("expected topic id and tx id, got %#v", out)
	}
}

func TestPublishEventRejectsEmptyBody(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/v1/events", bytes.NewReader([]byte("{}")))
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
