// Command publisher runs the Hedera publisher HTTP service.
package main

import (
	"context"
	"errors"
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

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
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
