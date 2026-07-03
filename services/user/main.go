package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/ovn-kubernetes/hat-shop/pkg/db"
	"github.com/ovn-kubernetes/hat-shop/pkg/middleware"
	"github.com/ovn-kubernetes/hat-shop/pkg/tracing"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/crypto/bcrypt"
)

const migration = `
CREATE SCHEMA IF NOT EXISTS users;

CREATE TABLE IF NOT EXISTS users.users (
	id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email         TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	name          TEXT NOT NULL,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type server struct {
	pool   *pgxpool.Pool
	tracer trace.Tracer
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	tracer, shutdown, err := tracing.Init(ctx, "user")
	if err != nil {
		slog.Error("tracing init", "err", err)
		os.Exit(1)
	}
	defer func() { if err := shutdown(context.Background()); err != nil { slog.Error("otel shutdown", "err", err) } }()

	pool, err := db.Connect(ctx)
	if err != nil {
		slog.Error("db connect", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := db.RunMigration(ctx, pool, migration); err != nil {
		slog.Error("migration", "err", err)
		os.Exit(1)
	}

	srv := &server{pool: pool, tracer: tracer}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", middleware.Health())
	mux.HandleFunc("POST /register", srv.register)
	mux.HandleFunc("POST /login", srv.login)
	mux.Handle("GET /users/{id}", middleware.Auth(http.HandlerFunc(srv.getUser)))

	handler := middleware.OTELPropagation(middleware.Logging(mux))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	httpSrv := &http.Server{Addr: ":" + port, Handler: handler}
	go func() {
		slog.Info("user service listening", "port", port)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("listen", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		slog.Error("http shutdown", "err", err)
	}
}

func (s *server) register(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "user.register")
	defer span.End()

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		middleware.Error(w, "hash failed", http.StatusInternalServerError)
		return
	}

	var u User
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users.users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name`,
		req.Email, string(hash), req.Name).Scan(&u.ID, &u.Email, &u.Name)
	if err != nil {
		middleware.Error(w, "email already registered", http.StatusConflict)
		return
	}

	w.WriteHeader(http.StatusCreated)
	middleware.JSON(w, u)
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "user.login")
	defer span.End()

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	var u User
	var hash string
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, name, password_hash FROM users.users WHERE email = $1`, req.Email).
		Scan(&u.ID, &u.Email, &u.Name, &hash)
	if err != nil {
		middleware.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		middleware.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, middleware.Claims{
		UserID: u.ID,
		Email:  u.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "insecure-dev-secret-change-me"
	}

	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		middleware.Error(w, "signing failed", http.StatusInternalServerError)
		return
	}

	middleware.JSON(w, map[string]string{"token": signed, "user_id": u.ID})
}

func (s *server) getUser(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "user.getUser")
	defer span.End()

	id := r.PathValue("id")
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, name FROM users.users WHERE id = $1`, id).
		Scan(&u.ID, &u.Email, &u.Name)
	if err != nil {
		middleware.Error(w, "user not found", http.StatusNotFound)
		return
	}

	middleware.JSON(w, u)
}
