package httpserver

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/tutur3u/platform/apps/backend/internal/config"
)

func TestHealthz(t *testing.T) {
	handler := New(config.Config{
		Environment: "test",
		ServiceName: "backend",
	}, slog.Default())

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	var body map[string]any
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode health response: %v", err)
	}

	if body["ok"] != true {
		t.Fatalf("expected ok response, got %#v", body)
	}
}

func TestReadyzRequiresInternalToken(t *testing.T) {
	handler := New(config.Config{ServiceName: "backend"}, slog.Default())

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status %d, got %d", http.StatusServiceUnavailable, response.Code)
	}
}

func TestJobRequiresAuthorization(t *testing.T) {
	handler := New(config.Config{
		InternalToken: "secret",
		ServiceName:   "backend",
	}, slog.Default())

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/internal/jobs/noop", nil)
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, response.Code)
	}
}

func TestJobRejectsUnknownJob(t *testing.T) {
	handler := New(config.Config{
		InternalToken: "secret",
		ServiceName:   "backend",
	}, slog.Default())

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/internal/jobs/unknown", nil)
	request.Header.Set("Authorization", "Bearer secret")
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, response.Code)
	}
}

func TestNoopJobAcceptsAuthorizedRequests(t *testing.T) {
	handler := New(config.Config{
		InternalToken: "secret",
		ServiceName:   "backend",
	}, slog.Default())

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/internal/jobs/noop", strings.NewReader("{}"))
	request.Header.Set("Authorization", "Bearer secret")
	request.Header.Set("X-Request-Id", "request-123")
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, response.Code)
	}

	var body map[string]any
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode job response: %v", err)
	}

	if body["job"] != "noop" || body["requestId"] != "request-123" || body["accepted"] != true {
		t.Fatalf("unexpected job response: %#v", body)
	}
}
