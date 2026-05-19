// Package server wires HTTP handlers, middleware, and routing for the publisher.
package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sync"

	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/config"
	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/hedera"
)

// Server holds the dependencies required by the HTTP layer.
type Server struct {
	cfg    *config.Config
	logger *slog.Logger
	hedera hedera.Client
	mux    *http.ServeMux

	// In-process mint idempotency cache. The web service supplies an
	// `Idempotency-Key` header on every `POST /v1/batches/mint`; when
	// we've already processed that key we return the cached result
	// instead of minting again. The map is bounded by `idempotencyMax`
	// entries with a simple FIFO eviction; that's enough for the
	// single-publisher-per-environment topology we run today. For a
	// multi-instance publisher a Redis-backed cache would replace this
	// in a follow-up; the contract on the wire stays the same.
	idempotencyMu    sync.Mutex
	idempotencyOrder []string
	idempotencyCache map[string]idempotentMint
}

type idempotentMint struct {
	result hedera.MintNFTResult
}

const idempotencyMax = 4096

// New constructs a Server with routes registered.
func New(cfg *config.Config, logger *slog.Logger, client hedera.Client) *Server {
	s := &Server{
		cfg:              cfg,
		logger:           logger,
		hedera:           client,
		mux:              http.NewServeMux(),
		idempotencyCache: make(map[string]idempotentMint, idempotencyMax),
	}
	s.routes()
	return s
}

// rememberMint stores `result` under the supplied idempotency key with
// FIFO eviction. Returns true if the key was already present (and the
// caller should reuse the cached result via lookupMint).
func (s *Server) rememberMint(key string, result hedera.MintNFTResult) {
	if key == "" {
		return
	}
	s.idempotencyMu.Lock()
	defer s.idempotencyMu.Unlock()
	if _, exists := s.idempotencyCache[key]; exists {
		return
	}
	if len(s.idempotencyOrder) >= idempotencyMax {
		// FIFO evict the oldest.
		oldest := s.idempotencyOrder[0]
		s.idempotencyOrder = s.idempotencyOrder[1:]
		delete(s.idempotencyCache, oldest)
	}
	s.idempotencyOrder = append(s.idempotencyOrder, key)
	s.idempotencyCache[key] = idempotentMint{result: result}
}

func (s *Server) lookupMint(key string) (hedera.MintNFTResult, bool) {
	if key == "" {
		return hedera.MintNFTResult{}, false
	}
	s.idempotencyMu.Lock()
	defer s.idempotencyMu.Unlock()
	entry, ok := s.idempotencyCache[key]
	return entry.result, ok
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
	s.mux.Handle("POST /v1/contracts/execute", s.withLogging(s.handleExecuteContract))
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
	// Idempotency: if the caller supplies an `Idempotency-Key` header
	// AND we've already processed that key, return the cached result
	// without touching the Hedera network. This closes the "we minted
	// then DB backfill failed -> reconciler retries -> duplicate NFT"
	// race: the reconciler resubmits with the same key and gets the
	// original mint result back.
	idempotencyKey := r.Header.Get("Idempotency-Key")
	if cached, ok := s.lookupMint(idempotencyKey); ok {
		writeJSON(w, http.StatusOK, cached)
		return
	}
	result, err := s.hedera.MintNFT(r.Context(), req.TokenID, req.Name, req.Symbol, req.Metadata)
	if err != nil {
		s.logger.Error("mint failed", "error", err)
		writeError(w, http.StatusBadGateway, "mint_failed")
		return
	}
	s.rememberMint(idempotencyKey, result)
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

type executeContractRequest struct {
	ContractID       string `json:"contractId"`
	FunctionSelector string `json:"functionSelector"`
	// Hex-encoded (0x-prefixed or unprefixed) ABI-encoded parameter bytes.
	// The web service owns ABI knowledge; the publisher is a thin shim.
	ArgsHex  string `json:"argsHex"`
	GasLimit int64  `json:"gasLimit,omitempty"`
}

func (s *Server) handleExecuteContract(w http.ResponseWriter, r *http.Request) {
	var req executeContractRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.ContractID == "" {
		writeError(w, http.StatusBadRequest, "`contractId` is required")
		return
	}
	if req.FunctionSelector == "" {
		writeError(w, http.StatusBadRequest, "`functionSelector` is required")
		return
	}
	args, err := decodeHex(req.ArgsHex)
	if err != nil {
		writeError(w, http.StatusBadRequest, "`argsHex` must be 0x-prefixed hex: "+err.Error())
		return
	}
	result, err := s.hedera.ExecuteContract(r.Context(), req.ContractID, req.FunctionSelector, args, req.GasLimit)
	if err != nil {
		s.logger.Error("execute contract failed", "error", err)
		writeError(w, http.StatusBadGateway, "execute_contract_failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// decodeHex parses a 0x-prefixed (or bare) hex string into raw bytes. An
// empty input is acceptable and yields an empty byte slice (no args).
func decodeHex(s string) ([]byte, error) {
	if s == "" {
		return nil, nil
	}
	if len(s) >= 2 && (s[:2] == "0x" || s[:2] == "0X") {
		s = s[2:]
	}
	if len(s)%2 != 0 {
		return nil, errors.New("hex length must be even")
	}
	out := make([]byte, len(s)/2)
	for i := 0; i < len(out); i++ {
		var b byte
		for j := 0; j < 2; j++ {
			c := s[i*2+j]
			var nib byte
			switch {
			case c >= '0' && c <= '9':
				nib = c - '0'
			case c >= 'a' && c <= 'f':
				nib = c - 'a' + 10
			case c >= 'A' && c <= 'F':
				nib = c - 'A' + 10
			default:
				return nil, errors.New("invalid hex digit")
			}
			b = (b << 4) | nib
		}
		out[i] = b
	}
	return out, nil
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
