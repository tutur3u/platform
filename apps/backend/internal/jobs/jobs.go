package jobs

import (
	"context"
	"errors"
	"time"
)

var ErrUnknownJob = errors.New("unknown job")

type Request struct {
	Name      string
	RequestID string
	Received  time.Time
}

type Result struct {
	Accepted  bool   `json:"accepted"`
	Job       string `json:"job"`
	Message   string `json:"message"`
	QueuedAt  string `json:"queuedAt"`
	RequestID string `json:"requestId"`
}

type Handler func(context.Context, Request) (Result, error)

type Registry struct {
	handlers map[string]Handler
}

func NewRegistry() *Registry {
	registry := &Registry{handlers: make(map[string]Handler)}
	registry.Register("noop", Noop)

	return registry
}

func (registry *Registry) Register(name string, handler Handler) {
	registry.handlers[name] = handler
}

func (registry *Registry) Handle(ctx context.Context, request Request) (Result, error) {
	handler, ok := registry.handlers[request.Name]
	if !ok {
		return Result{}, ErrUnknownJob
	}

	return handler(ctx, request)
}

func Noop(_ context.Context, request Request) (Result, error) {
	return Result{
		Accepted:  true,
		Job:       request.Name,
		Message:   "noop job accepted",
		QueuedAt:  request.Received.UTC().Format(time.RFC3339Nano),
		RequestID: request.RequestID,
	}, nil
}
