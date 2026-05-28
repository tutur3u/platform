package config

import (
	"net"
	"os"
	"strings"
)

type Config struct {
	Environment   string
	InternalToken string
	Port          string
	ServiceName   string
}

func Load() Config {
	return Config{
		Environment:   env("BACKEND_ENV", "development"),
		InternalToken: strings.TrimSpace(os.Getenv("BACKEND_INTERNAL_TOKEN")),
		Port:          normalizePort(env("PORT", "7820")),
		ServiceName:   env("BACKEND_SERVICE_NAME", "backend"),
	}
}

func (cfg Config) Address() string {
	return net.JoinHostPort("", cfg.Port)
}

func (cfg Config) HealthcheckURL() string {
	return "http://" + net.JoinHostPort("127.0.0.1", cfg.Port) + "/healthz"
}

func (cfg Config) Ready() bool {
	return cfg.InternalToken != ""
}

func env(name string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}

	return value
}

func normalizePort(value string) string {
	return strings.TrimPrefix(strings.TrimSpace(value), ":")
}
