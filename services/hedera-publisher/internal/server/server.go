// Package server wires HTTP handlers, middleware, and routing for the publisher.
package server

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/config"
	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/hedera"
)

// Server holds the dependencies required by the HTTP layer.
type Server struct {
	cfg    *config.Config
	logger *slog.Logger
	hedera hedera.Client
	mux    *http.ServeMux
}

// New constructs a Server with routes registered.
func New(cfg *config.Config, logger *slog.Logger, client hedera.Client) *Server {
	s := &Server{
		cfg:    cfg,
		logger: logger,
		hedera: client,
		mux:    http.NewServeMux(),
	}
	s.routes()
	return s
}

// ServeHTTP delegates to the embedded mux, allowing Server to be used directly
// as an http.Handler. Middleware is composed in routes().
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealth)
	s.mux.HandleFunc("GET /readyz", s.handleReady)

	s.mux.Handle("POST /v1/events", s.withLogging(s.handlePublishEvent))
	s.mux.Handle("POST /v1/batches/mint", s.withLogging(s.handleMintBatch))
	s.mux.Handle("POST /v1/batches/transfer", s.withLogging(s.handleTransferBatch))
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleReady(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"mode":   s.hedera.Mode(),
	})
}

// --- Handlers -------------------------------------------------------------

type publishEventRequest struct {
	TopicID string          `json:"topicId,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

func (s *Server) handlePublishEvent(w http.ResponseWriter, r *http.Request) {
	var req publishEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(req.Payload) == 0 {
		writeError(w, http.StatusBadRequest, "`payload` is required")
		return
	}
	result, err := s.hedera.SubmitMessage(r.Context(), req.TopicID, req.Payload)
	if err != nil {
		s.logger.Error("submit message failed", "error", err)
		writeError(w, http.StatusBadGateway, "submit_message_failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type mintBatchRequest struct {
	TokenID  string          `json:"tokenId,omitempty"`
	Name     string          `json:"name,omitempty"`
	Symbol   string          `json:"symbol,omitempty"`
	Metadata json.RawMessage `json:"metadata"`
}

func (s *Server) handleMintBatch(w http.ResponseWriter, r *http.Request) {
	var req mintBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(req.Metadata) == 0 {
		writeError(w, http.StatusBadRequest, "`metadata` is required")
		return
	}
	result, err := s.hedera.MintNFT(r.Context(), req.TokenID, req.Name, req.Symbol, req.Metadata)
	if err != nil {
		s.logger.Error("mint failed", "error", err)
		writeError(w, http.StatusBadGateway, "mint_failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type transferBatchRequest struct {
	TokenID      string `json:"tokenId"`
	SerialNumber int64  `json:"serialNumber"`
	FromAccount  string `json:"fromAccount"`
	ToAccount    string `json:"toAccount"`
}

func (s *Server) handleTransferBatch(w http.ResponseWriter, r *http.Request) {
	var req transferBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.TokenID == "" || req.SerialNumber == 0 || req.FromAccount == "" || req.ToAccount == "" {
		writeError(w, http.StatusBadRequest, "tokenId, serialNumber, fromAccount, toAccount are all required")
		return
	}
	result, err := s.hedera.TransferNFT(r.Context(), req.TokenID, req.SerialNumber, req.FromAccount, req.ToAccount)
	if err != nil {
		s.logger.Error("transfer failed", "error", err)
		writeError(w, http.StatusBadGateway, "transfer_failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// --- Helpers --------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (s *Server) withLogging(h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.logger.Info("request", "method", r.Method, "path", r.URL.Path)
		h(w, r)
	})
}
