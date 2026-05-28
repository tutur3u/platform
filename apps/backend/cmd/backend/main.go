package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/tutur3u/platform/apps/backend/internal/config"
	"github.com/tutur3u/platform/apps/backend/internal/httpserver"
)

func main() {
	cfg := config.Load()

	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		if err := runHealthcheck(cfg); err != nil {
			_, _ = fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		return
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	server := &http.Server{
		Addr:              cfg.Address(),
		Handler:           httpserver.New(cfg, logger),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info("backend server listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("backend server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("backend server shutdown failed", "error", err)
		os.Exit(1)
	}
}

func runHealthcheck(cfg config.Config) error {
	client := http.Client{Timeout: 3 * time.Second}
	response, err := client.Get(cfg.HealthcheckURL())
	if err != nil {
		return fmt.Errorf("backend healthcheck failed: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("backend healthcheck returned status %d", response.StatusCode)
	}

	return nil
}
