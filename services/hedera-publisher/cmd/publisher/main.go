// Command publisher runs the Hedera publisher HTTP service.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/config"
	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/hedera"
	"github.com/Shamba-Records-Limited/traceability/services/hedera-publisher/internal/server"
)

// healthcheckFlag is exposed so the container image can act as its own
// healthcheck probe. The base image is `gcr.io/distroless/static`, which
// has neither a shell nor `wget`/`curl`, so any compose-level
// HEALTHCHECK has to be a self-call into this binary.
var healthcheckFlag = flag.Bool("healthcheck", false,
	"perform an HTTP GET against the local /healthz endpoint and exit 0 on 200, 1 otherwise")

func main() {
	flag.Parse()
	if *healthcheckFlag {
		os.Exit(runHealthcheck())
	}
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

// runHealthcheck calls the service's own /healthz endpoint over loopback
// and returns 0 on a 2xx response, 1 otherwise. It deliberately uses a
// short timeout so a stuck process is reported as unhealthy quickly.
func runHealthcheck() int {
	port := os.Getenv("HTTP_PORT")
	if port == "" {
		port = "8080"
	}
	url := fmt.Sprintf("http://127.0.0.1:%s/healthz", port)

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "healthcheck: %v\n", err)
		return 1
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fmt.Fprintf(os.Stderr, "healthcheck: status %d\n", resp.StatusCode)
		return 1
	}
	return 0
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := newLogger(cfg.LogLevel)
	slog.SetDefault(logger)

	client, err := hedera.NewClient(cfg, logger)
	if err != nil {
		return err
	}
	defer client.Close()

	srv := server.New(cfg, logger, client)

	httpServer := &http.Server{
		Addr:              ":" + cfg.HTTPPort,
		Handler:           srv,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		logger.Info("publisher starting", "port", cfg.HTTPPort, "mode", client.Mode())
		if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			errs <- err
		}
		close(errs)
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-shutdown:
		logger.Info("shutdown signal received", "signal", sig.String())
	case err := <-errs:
		if err != nil {
			return err
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		return err
	}
	logger.Info("publisher stopped")
	return nil
}

func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl}))
}
