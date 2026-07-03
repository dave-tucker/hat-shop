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

	"github.com/ovn-kubernetes/hat-shop/pkg/db"
	"github.com/ovn-kubernetes/hat-shop/pkg/middleware"
	"github.com/ovn-kubernetes/hat-shop/pkg/tracing"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel/trace"
)

const migration = `
CREATE SCHEMA IF NOT EXISTS carts;

CREATE TABLE IF NOT EXISTS carts.carts (
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID NOT NULL UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carts.items (
	id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	cart_id  UUID NOT NULL REFERENCES carts.carts(id) ON DELETE CASCADE,
	hat_id   UUID NOT NULL,
	quantity INT NOT NULL DEFAULT 1,
	UNIQUE (cart_id, hat_id)
);
`

type CartItem struct {
	ID       string `json:"id"`
	HatID    string `json:"hat_id"`
	Quantity int    `json:"quantity"`
}

type Cart struct {
	ID     string     `json:"id"`
	UserID string     `json:"user_id"`
	Items  []CartItem `json:"items"`
}

type server struct {
	pool   *pgxpool.Pool
	tracer trace.Tracer
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	tracer, shutdown, err := tracing.Init(ctx, "carts")
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
	mux.Handle("GET /carts/{userId}", middleware.Auth(http.HandlerFunc(srv.getCart)))
	mux.Handle("POST /carts/{userId}/items", middleware.Auth(http.HandlerFunc(srv.addItem)))
	mux.Handle("DELETE /carts/{userId}/items/{itemId}", middleware.Auth(http.HandlerFunc(srv.removeItem)))
	mux.Handle("DELETE /carts/{userId}", middleware.Auth(http.HandlerFunc(srv.clearCart)))

	handler := middleware.OTELPropagation(middleware.Logging(mux))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	httpSrv := &http.Server{Addr: ":" + port, Handler: handler}
	go func() {
		slog.Info("carts service listening", "port", port)
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

func (s *server) ensureCart(ctx context.Context, userID string) (string, error) {
	var cartID string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO carts.carts (user_id) VALUES ($1)
		 ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
		 RETURNING id`, userID).Scan(&cartID)
	return cartID, err
}

func (s *server) getCart(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "carts.getCart")
	defer span.End()

	userID := r.PathValue("userId")
	cartID, err := s.ensureCart(ctx, userID)
	if err != nil {
		middleware.Error(w, "cart error", http.StatusInternalServerError)
		return
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, hat_id, quantity FROM carts.items WHERE cart_id = $1`, cartID)
	if err != nil {
		middleware.Error(w, "query", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	cart := Cart{ID: cartID, UserID: userID, Items: []CartItem{}}
	for rows.Next() {
		var item CartItem
		rows.Scan(&item.ID, &item.HatID, &item.Quantity)
		cart.Items = append(cart.Items, item)
	}

	middleware.JSON(w, cart)
}

func (s *server) addItem(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "carts.addItem")
	defer span.End()

	userID := r.PathValue("userId")
	cartID, err := s.ensureCart(ctx, userID)
	if err != nil {
		middleware.Error(w, "cart error", http.StatusInternalServerError)
		return
	}

	var req struct {
		HatID    string `json:"hat_id"`
		Quantity int    `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Quantity < 1 {
		middleware.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO carts.items (cart_id, hat_id, quantity) VALUES ($1, $2, $3)
		 ON CONFLICT (cart_id, hat_id) DO UPDATE SET quantity = carts.items.quantity + EXCLUDED.quantity`,
		cartID, req.HatID, req.Quantity)
	if err != nil {
		middleware.Error(w, "insert", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (s *server) removeItem(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "carts.removeItem")
	defer span.End()

	itemID := r.PathValue("itemId")
	_, err := s.pool.Exec(ctx, `DELETE FROM carts.items WHERE id = $1`, itemID)
	if err != nil {
		middleware.Error(w, "delete", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) clearCart(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "carts.clearCart")
	defer span.End()

	userID := r.PathValue("userId")
	_, err := s.pool.Exec(ctx,
		`DELETE FROM carts.items WHERE cart_id = (SELECT id FROM carts.carts WHERE user_id = $1)`, userID)
	if err != nil {
		middleware.Error(w, "clear", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
