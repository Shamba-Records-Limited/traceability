// Package config loads service configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

// Network identifies the target Hedera network.
type Network string

const (
	NetworkTestnet    Network = "testnet"
	NetworkPreviewnet Network = "previewnet"
	NetworkMainnet    Network = "mainnet"
)

// Config holds the resolved runtime configuration for the publisher service.
type Config struct {
	Network             Network
	OperatorID          string
	OperatorPrivateKey  string
	TreasuryID          string
	TreasuryPrivateKey  string
	HTTPPort            string
	LogLevel            string
	MockMode            bool
}

// Load reads configuration from environment variables and validates it.
//
// When HEDERA_OPERATOR_ID or HEDERA_OPERATOR_PRIVATE_KEY is empty, the
// service enters mock mode: all Hedera operations return deterministic
// fake responses. This is the default for local development.
func Load() (*Config, error) {
	cfg := &Config{
		Network:            Network(envDefault("HEDERA_NETWORK", string(NetworkTestnet))),
		OperatorID:         os.Getenv("HEDERA_OPERATOR_ID"),
		OperatorPrivateKey: os.Getenv("HEDERA_OPERATOR_PRIVATE_KEY"),
		TreasuryID:         os.Getenv("HEDERA_TREASURY_ID"),
		TreasuryPrivateKey: os.Getenv("HEDERA_TREASURY_PRIVATE_KEY"),
		HTTPPort:           envDefault("HTTP_PORT", "8080"),
		LogLevel:           strings.ToLower(envDefault("LOG_LEVEL", "info")),
	}

	switch cfg.Network {
	case NetworkTestnet, NetworkPreviewnet, NetworkMainnet:
	default:
		return nil, fmt.Errorf("invalid HEDERA_NETWORK %q (want testnet|previewnet|mainnet)", cfg.Network)
	}

	cfg.MockMode = cfg.OperatorID == "" || cfg.OperatorPrivateKey == ""

	if !cfg.MockMode {
		if cfg.TreasuryID == "" || cfg.TreasuryPrivateKey == "" {
			return nil, errors.New("HEDERA_TREASURY_ID and HEDERA_TREASURY_PRIVATE_KEY are required when operator credentials are set")
		}
	}

	return cfg, nil
}

func envDefault(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}
