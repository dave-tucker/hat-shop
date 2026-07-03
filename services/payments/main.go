package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"math"
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
CREATE SCHEMA IF NOT EXISTS payments;

CREATE TABLE IF NOT EXISTS payments.payments (
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	order_id   UUID NOT NULL,
	amount     NUMERIC(10,2) NOT NULL,
	tokens     BIGINT NOT NULL,
	status     TEXT NOT NULL DEFAULT 'authorised',
	cluster    TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

type Payment struct {
	ID        string    `json:"id"`
	OrderID   string    `json:"order_id"`
	Amount    float64   `json:"amount"`
	Tokens    int64     `json:"tokens"`
	Status    string    `json:"status"`
	Cluster   string    `json:"cluster"`
	CreatedAt time.Time `json:"created_at"`
}

type server struct {
	pool   *pgxpool.Pool
	tracer trace.Tracer
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	tracer, shutdown, err := tracing.Init(ctx, "payments")
	if err != nil {
		slog.Error("tracing init", "err", err)
		os.Exit(1)
	}
	defer func() {
		if err := shutdown(context.Background()); err != nil {
			slog.Error("otel shutdown", "err", err)
		}
	}()

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
	mux.Handle("POST /payments", middleware.Auth(http.HandlerFunc(srv.processPayment)))
	mux.Handle("GET /payments/{orderId}", middleware.Auth(http.HandlerFunc(srv.getPayment)))

	handler := middleware.OTELPropagation(middleware.Logging(mux))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	httpSrv := &http.Server{Addr: ":" + port, Handler: handler}
	go func() {
		slog.Info("payments service listening", "port", port)
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

func (s *server) processPayment(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "payments.processPayment")
	defer span.End()

	var req struct {
		OrderID string  `json:"order_id"`
		UserID  string  `json:"user_id"`
		Amount  float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	// Token cost = ceil(dollar amount). 1 token ≈ $1.
	tokenCost := int64(math.Ceil(req.Amount))

	cluster := os.Getenv("CLUSTER_NAME")
	if cluster == "" {
		cluster = "local"
	}

	// Atomically deduct tokens from the user's balance.
	// If the user doesn't have enough tokens the UPDATE matches 0 rows → 402.
	tag, err := s.pool.Exec(ctx,
		`UPDATE users.users SET tokens = tokens - $1 WHERE id = $2 AND tokens >= $1`,
		tokenCost, req.UserID)
	if err != nil {
		middleware.Error(w, "token deduction failed", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		middleware.Error(w, "insufficient tokens", http.StatusPaymentRequired)
		return
	}

	// Record the payment.
	var p Payment
	err = s.pool.QueryRow(ctx,
		`INSERT INTO payments.payments (order_id, amount, tokens, cluster)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, order_id, amount::float8, tokens, status, cluster, created_at`,
		req.OrderID, req.Amount, tokenCost, cluster).
		Scan(&p.ID, &p.OrderID, &p.Amount, &p.Tokens, &p.Status, &p.Cluster, &p.CreatedAt)
	if err != nil {
		middleware.Error(w, "payment record failed", http.StatusInternalServerError)
		return
	}

	// Transition order: pending → paid (cross-schema, same CockroachDB cluster).
	_, err = s.pool.Exec(ctx,
		`UPDATE orders.orders SET status = 'paid' WHERE id = $1`, req.OrderID)
	if err != nil {
		slog.Error("order status update", "err", err, "order_id", req.OrderID)
		// Non-fatal — tokens deducted, payment recorded.
	}

	w.WriteHeader(http.StatusCreated)
	middleware.JSON(w, p)
}

func (s *server) getPayment(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "payments.getPayment")
	defer span.End()

	orderID := r.PathValue("orderId")
	var p Payment
	err := s.pool.QueryRow(ctx,
		`SELECT id, order_id, amount::float8, tokens, status, cluster, created_at
		 FROM payments.payments WHERE order_id = $1`, orderID).
		Scan(&p.ID, &p.OrderID, &p.Amount, &p.Tokens, &p.Status, &p.Cluster, &p.CreatedAt)
	if err != nil {
		middleware.Error(w, "payment not found", http.StatusNotFound)
		return
	}
	middleware.JSON(w, p)
}
