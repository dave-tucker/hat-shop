// Package middleware provides shared HTTP middleware for Hat Shop services.
package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

// ContextKey is used to store request-scoped values.
type ContextKey string

const (
	ClaimsKey ContextKey = "claims"
)

// Claims represents the JWT payload issued by the user service.
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// Logging wraps a handler with structured request logging via slog.
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"cluster", clusterName(),
		)
	})
}

// OTELPropagation injects/extracts OTEL trace context from HTTP headers.
func OTELPropagation(next http.Handler) http.Handler {
	prop := otel.GetTextMapPropagator()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := prop.Extract(r.Context(), propagation.HeaderCarrier(r.Header))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Auth validates a Bearer JWT and stores the claims in the request context.
// Returns 401 if the token is missing or invalid.
func Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if raw == "" {
			Error(w, "missing authorization", http.StatusUnauthorized)
			return
		}

		claims := &Claims{}
		_, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return jwtSecret(), nil
		})
		if err != nil {
			Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ClaimsFrom extracts JWT claims stored by the Auth middleware.
func ClaimsFrom(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(ClaimsKey).(*Claims)
	return c, ok
}

// Health returns a simple 200 OK handler suitable for liveness/readiness probes.
func Health() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		JSON(w, map[string]string{"status": "ok", "cluster": clusterName()})
	}
}

// JSON writes v as a JSON response with status 200.
func JSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("json encode", "err", err)
	}
}

// Error writes a JSON error response.
func Error(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(map[string]string{"error": msg}); err != nil {
		slog.Error("json encode error", "err", err)
	}
}

func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		return []byte("insecure-dev-secret-change-me")
	}
	return []byte(s)
}

func clusterName() string {
	if n := os.Getenv("CLUSTER_NAME"); n != "" {
		return n
	}
	return "local"
}

// responseWriter captures the status code written by a handler.
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}
