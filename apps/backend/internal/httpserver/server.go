package httpserver

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/tutur3u/platform/apps/backend/internal/config"
	"github.com/tutur3u/platform/apps/backend/internal/jobs"
)

type Server struct {
	cfg    config.Config
	jobs   *jobs.Registry
	logger *slog.Logger
}

func New(cfg config.Config, logger *slog.Logger) http.Handler {
	if logger == nil {
		logger = slog.Default()
	}

	server := &Server{
		cfg:    cfg,
		jobs:   jobs.NewRegistry(),
		logger: logger,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", server.handleHealth)
	mux.HandleFunc("/readyz", server.handleReady)
	mux.HandleFunc("/internal/jobs/", server.handleJob)

	return mux
}

func (server *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"environment": server.cfg.Environment,
		"ok":          true,
		"service":     server.cfg.ServiceName,
	})
}

func (server *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w, http.MethodGet)
		return
	}

	if !server.cfg.Ready() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error":   "BACKEND_INTERNAL_TOKEN is required",
			"ok":      false,
			"service": server.cfg.ServiceName,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"service": server.cfg.ServiceName,
	})
}

func (server *Server) handleJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w, http.MethodPost)
		return
	}

	if !server.cfg.Ready() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"error": "backend internal token is not configured",
		})
		return
	}

	if !server.authorized(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"error": "unauthorized",
		})
		return
	}

	jobName := strings.Trim(strings.TrimPrefix(r.URL.Path, "/internal/jobs/"), "/")
	requestID := requestID(r)
	result, err := server.jobs.Handle(r.Context(), jobs.Request{
		Name:      jobName,
		Received:  time.Now(),
		RequestID: requestID,
	})
	if errors.Is(err, jobs.ErrUnknownJob) {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error":     "unknown job",
			"job":       jobName,
			"requestId": requestID,
		})
		return
	}
	if err != nil {
		server.logger.ErrorContext(
			r.Context(),
			"backend job failed",
			"job",
			jobName,
			"request_id",
			requestID,
		)
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"error":     "job failed",
			"requestId": requestID,
		})
		return
	}

	writeJSON(w, http.StatusAccepted, result)
}

func (server *Server) authorized(r *http.Request) bool {
	expected := "Bearer " + server.cfg.InternalToken
	actual := r.Header.Get("Authorization")

	return subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) == 1
}

func requestID(r *http.Request) string {
	for _, header := range []string{"X-Request-Id", "X-Request-ID"} {
		value := strings.TrimSpace(r.Header.Get(header))
		if value != "" {
			return value
		}
	}

	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return time.Now().UTC().Format("20060102T150405.000000000Z")
	}

	return hex.EncodeToString(bytes[:])
}

func writeMethodNotAllowed(w http.ResponseWriter, allowed string) {
	w.Header().Set("Allow", allowed)
	writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
		"error": "method not allowed",
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
