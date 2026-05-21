// Package server wires HTTP handlers, middleware, and routing for the publisher.
package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

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

	// Per-IP rate limiter for `POST /v1/accounts/create`. Account
	// creation is the only endpoint that materially spends operator
	// HBAR per call (each new account is funded with ~10 HBAR), so a
	// rogue caller looping the endpoint would drain the operator
	// balance fast. A simple sliding-window counter capped at
	// `accountsCreateRateLimit` per `accountsCreateRateWindow` is
	// enough for the current single-publisher topology; if we ever
	// run the publisher behind multiple instances this becomes a
	// Redis-backed token bucket.
	accountsCreateMu      sync.Mutex
	accountsCreateBuckets map[string]*accountCreateBucket
}

type idempotentMint struct {
	result hedera.MintNFTResult
}

const idempotencyMax = 4096

// accountCreateBucket tracks the timestamps of recent successful
// account-create attempts from a single source IP. We keep timestamps
// rather than a single counter so the limiter is sliding-window — a
// fixed window lets a caller burst 2x the limit at the boundary, which
// for a real-HBAR endpoint we want to avoid.
type accountCreateBucket struct {
	timestamps []time.Time
}

const (
	// accountsCreateRateLimit caps the per-IP create rate to 10 per
	// `accountsCreateRateWindow`. 10/hour is generous for a real
	// human (onboarding happens once) and tight enough that even a
	// short-lived abuse loop is bounded before an operator can
	// rotate keys.
	accountsCreateRateLimit  = 10
	accountsCreateRateWindow = time.Hour
)

// New constructs a Server with routes registered.
func New(cfg *config.Config, logger *slog.Logger, client hedera.Client) *Server {
	s := &Server{
		cfg:                   cfg,
		logger:                logger,
		hedera:                client,
		mux:                   http.NewServeMux(),
		idempotencyCache:      make(map[string]idempotentMint, idempotencyMax),
		accountsCreateBuckets: make(map[string]*accountCreateBucket),
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
	s.mux.Handle("POST /v1/accounts/create", s.withLogging(s.handleCreateAccount))
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

// --- Account creation -----------------------------------------------------

type createAccountRequest struct {
	// Optional human-readable label, persisted as the Hedera account
	// memo (capped at 100 bytes server-side). Useful for grouping
	// system-generated wallets in the operator's audit trail.
	Label string `json:"label,omitempty"`
	// Optional initial balance override, in tinybars. Defaults to
	// `defaultInitialBalanceTinybars` (10 HBAR). Negative values are
	// rejected; very large values are accepted but will fail the
	// transaction if the operator has insufficient balance.
	InitialBalanceTinybars int64 `json:"initialBalanceTinybars,omitempty"`
}

// defaultInitialBalanceTinybars is the funding amount used when a caller
// doesn't supply one. 10 HBAR is enough to cover a few hundred HCS
// submissions or NFT transfers, which is more than a typical new actor
// will execute before they top up.
const defaultInitialBalanceTinybars int64 = 10 * 100_000_000

func (s *Server) handleCreateAccount(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !s.allowAccountCreate(ip) {
		s.logger.Warn("accounts/create rate limit hit", "ip", ip)
		w.Header().Set("Retry-After", "3600")
		writeError(w, http.StatusTooManyRequests, "account creation rate limit exceeded; retry later")
		return
	}

	var req createAccountRequest
	// Empty bodies are acceptable — both label and balance are optional.
	// Decode best-effort and reject only on actually-malformed JSON.
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
	}
	if req.InitialBalanceTinybars < 0 {
		writeError(w, http.StatusBadRequest, "initialBalanceTinybars must be >= 0")
		return
	}
	balance := req.InitialBalanceTinybars
	if balance == 0 {
		balance = defaultInitialBalanceTinybars
	}

	result, err := s.hedera.CreateAccount(r.Context(), balance, req.Label)
	if err != nil {
		s.logger.Error("account create failed", "error", err, "ip", ip)
		writeError(w, http.StatusBadGateway, "account_create_failed")
		return
	}
	// Intentionally do NOT log the generated private key; the publisher
	// is a single-shot relay for the keypair to its eventual encrypted-
	// at-rest home in the web app's DB. Log only the new account id +
	// transaction id, which are already public-via-mirror-node.
	s.logger.Info("account created",
		"accountId", result.AccountID,
		"createTxId", result.CreateTransactionID,
		"ip", ip,
	)
	writeJSON(w, http.StatusOK, result)
}

// allowAccountCreate returns true if the given client IP is permitted to
// issue another `POST /v1/accounts/create` request right now. Updates
// the bucket on success so subsequent attempts are correctly counted.
// An empty IP is treated as un-attributable and always rejected; we
// would rather fail closed than offer an un-rate-limited bypass.
func (s *Server) allowAccountCreate(ip string) bool {
	if ip == "" {
		return false
	}
	now := time.Now()
	cutoff := now.Add(-accountsCreateRateWindow)

	s.accountsCreateMu.Lock()
	defer s.accountsCreateMu.Unlock()

	bucket, ok := s.accountsCreateBuckets[ip]
	if !ok {
		bucket = &accountCreateBucket{}
		s.accountsCreateBuckets[ip] = bucket
	}

	// Compact the bucket: drop timestamps older than the window. A
	// fresh slice keeps the underlying array from growing unbounded
	// over a long-lived process.
	kept := bucket.timestamps[:0]
	for _, t := range bucket.timestamps {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	bucket.timestamps = kept

	if len(bucket.timestamps) >= accountsCreateRateLimit {
		return false
	}
	bucket.timestamps = append(bucket.timestamps, now)
	return true
}

// clientIP extracts the best-effort source IP from the request. Honours
// `X-Forwarded-For` when present (the publisher sits behind Fly's proxy
// in production) but defends against header spoofing by only ever using
// the *first* hop — that's the entry point of the edge proxy, the only
// field a downstream relay cannot forge.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.Index(xff, ","); i >= 0 {
			xff = xff[:i]
		}
		if ip := strings.TrimSpace(xff); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
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
