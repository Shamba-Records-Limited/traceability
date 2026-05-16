// Package server wires HTTP handlers for the did-issuer service.
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Shamba-Records-Limited/traceability/services/did-issuer/internal/config"
	"github.com/Shamba-Records-Limited/traceability/services/did-issuer/internal/diddoc"
	"github.com/Shamba-Records-Limited/traceability/services/did-issuer/internal/hedera"
)

const mintTimeout = 60 * time.Second

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

// ServeHTTP delegates to the embedded mux so Server itself can be used as
// an http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealth)
	s.mux.HandleFunc("GET /readyz", s.handleReady)
	s.mux.Handle("POST /v1/dids/mint", s.withLogging(s.handleMint))
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleReady(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"mode":    s.hedera.Mode(),
		"network": string(s.hedera.Network()),
	})
}

type mintRequest struct {
	ActorID                      string `json:"actorId"`
	DisplayName                  string `json:"displayName,omitempty"`
	ControllerPublicKeyMultibase string `json:"controllerPublicKeyMultibase,omitempty"`
}

func (s *Server) handleMint(w http.ResponseWriter, r *http.Request) {
	var req mintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.ActorID) == "" {
		writeError(w, http.StatusBadRequest, "`actorId` is required")
		return
	}

	// Build a minimal DID document. The DID itself is unknown until the HCS
	// topic exists, so we build with a placeholder and rewrite the ID once
	// the mint succeeds.
	doc := diddoc.Build("", req.ControllerPublicKeyMultibase)
	docJSON, err := doc.Marshal()
	if err != nil {
		s.logger.Error("marshal did document failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal_marshal_failed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), mintTimeout)
	defer cancel()

	result, err := s.hedera.MintDID(ctx, req.ActorID, docJSON)
	if err != nil {
		s.logger.Error("mint did failed", "actorId", req.ActorID, "error", err)
		writeError(w, http.StatusBadGateway, "mint_failed")
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
