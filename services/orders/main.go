package main

import (
	"context"
	"encoding/json"
	"fmt"
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
	"github.com/segmentio/kafka-go"
	"go.opentelemetry.io/otel/trace"
)

const migration = `
CREATE SCHEMA IF NOT EXISTS orders;

CREATE TABLE IF NOT EXISTS orders.orders (
	id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id          UUID NOT NULL,
	status           TEXT NOT NULL DEFAULT 'pending',
	total            NUMERIC(10,2) NOT NULL,
	cluster          TEXT NOT NULL,
	shipping_address TEXT NOT NULL DEFAULT 'Default Gateway — 0.0.0.0, The Internet',
	created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders.orders ADD COLUMN IF NOT EXISTS
	shipping_address TEXT NOT NULL DEFAULT 'Default Gateway — 0.0.0.0, The Internet';

CREATE TABLE IF NOT EXISTS orders.items (
	id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	order_id UUID NOT NULL REFERENCES orders.orders(id),
	hat_id   UUID NOT NULL,
	quantity INT NOT NULL,
	price    NUMERIC(10,2) NOT NULL
);
`

// Status values for the orders lifecycle:
//   pending  → order created, awaiting payment
//   paid     → payment authorised by payments service
//   shipped  → shipment created by shipping service (Kafka consumer)
//   delivered → future use

type OrderItem struct {
	HatID    string  `json:"hat_id"`
	Quantity int     `json:"quantity"`
	Price    float64 `json:"price"`
}

type Order struct {
	ID              string      `json:"id"`
	UserID          string      `json:"user_id"`
	Status          string      `json:"status"`
	Total           float64     `json:"total"`
	Cluster         string      `json:"cluster"`
	ShippingAddress string      `json:"shipping_address"`
	Items           []OrderItem `json:"items,omitempty"`
	CreatedAt       time.Time   `json:"created_at"`
}

type server struct {
	pool   *pgxpool.Pool
	kafka  *kafka.Writer
	tracer trace.Tracer
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	tracer, shutdown, err := tracing.Init(ctx, "orders")
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

	kw := &kafka.Writer{
		Addr:     kafka.TCP(os.Getenv("KAFKA_ADDR")),
		Topic:    "orders.created",
		Balancer: &kafka.LeastBytes{},
	}
	defer kw.Close()

	srv := &server{pool: pool, kafka: kw, tracer: tracer}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", middleware.Health())
	mux.Handle("POST /orders", middleware.Auth(http.HandlerFunc(srv.createOrder)))
	mux.Handle("GET /orders", middleware.Auth(http.HandlerFunc(srv.listOrders)))
	mux.Handle("GET /orders/{id}", middleware.Auth(http.HandlerFunc(srv.getOrder)))
	// Internal status transition endpoint — called by payments and shipping services.
	mux.HandleFunc("PATCH /orders/{id}/status", srv.updateStatus)

	handler := middleware.OTELPropagation(middleware.Logging(mux))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	httpSrv := &http.Server{Addr: ":" + port, Handler: handler}
	go func() {
		slog.Info("orders service listening", "port", port)
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

func (s *server) createOrder(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "orders.createOrder")
	defer span.End()

	claims, _ := middleware.ClaimsFrom(ctx)

	var req struct {
		Items           []OrderItem `json:"items"`
		ShippingAddress string      `json:"shipping_address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	var total float64
	for _, item := range req.Items {
		total += item.Price * float64(item.Quantity)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		middleware.Error(w, "tx begin", http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Check and decrement stock for each item atomically within the transaction.
	// The UPDATE only succeeds if stock >= requested quantity.
	for _, item := range req.Items {
		tag, err := tx.Exec(ctx,
			`UPDATE catalogue.hats SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
			item.Quantity, item.HatID)
		if err != nil {
			middleware.Error(w, "stock check failed", http.StatusInternalServerError)
			return
		}
		if tag.RowsAffected() == 0 {
			middleware.Error(w,
				fmt.Sprintf("insufficient stock for hat %s", item.HatID),
				http.StatusConflict)
			return
		}
	}

	cluster := os.Getenv("CLUSTER_NAME")
	if cluster == "" {
		cluster = "local"
	}

	addr := req.ShippingAddress
	if addr == "" {
		addr = "Default Gateway — 0.0.0.0, The Internet"
	}

	var orderID string
	err = tx.QueryRow(ctx,
		`INSERT INTO orders.orders (user_id, total, cluster, shipping_address)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		claims.UserID, total, cluster, addr).Scan(&orderID)
	if err != nil {
		middleware.Error(w, "insert order", http.StatusInternalServerError)
		return
	}

	for _, item := range req.Items {
		_, err = tx.Exec(ctx,
			`INSERT INTO orders.items (order_id, hat_id, quantity, price) VALUES ($1, $2, $3, $4)`,
			orderID, item.HatID, item.Quantity, item.Price)
		if err != nil {
			middleware.Error(w, "insert item", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		middleware.Error(w, "commit", http.StatusInternalServerError)
		return
	}

	// Publish event so shipping can pick it up.
	payload, _ := json.Marshal(map[string]any{
		"order_id":         orderID,
		"user_id":          claims.UserID,
		"cluster":          cluster,
		"total":            total,
		"shipping_address": addr,
	})
	_ = s.kafka.WriteMessages(ctx, kafka.Message{
		Key:   []byte(orderID),
		Value: payload,
	})

	w.WriteHeader(http.StatusCreated)
	middleware.JSON(w, map[string]string{"id": orderID})
}

func (s *server) updateStatus(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "orders.updateStatus")
	defer span.End()

	id := r.PathValue("id")

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	allowed := map[string]bool{"paid": true, "shipped": true, "delivered": true, "cancelled": true}
	if !allowed[req.Status] {
		middleware.Error(w, "invalid status", http.StatusBadRequest)
		return
	}

	tag, err := s.pool.Exec(ctx,
		`UPDATE orders.orders SET status = $1 WHERE id = $2`, req.Status, id)
	if err != nil || tag.RowsAffected() == 0 {
		middleware.Error(w, "order not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *server) listOrders(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "orders.listOrders")
	defer span.End()

	claims, _ := middleware.ClaimsFrom(ctx)

	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, status, total::float8, cluster, shipping_address, created_at
		 FROM orders.orders WHERE user_id = $1 ORDER BY created_at DESC`,
		claims.UserID)
	if err != nil {
		middleware.Error(w, "query", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.UserID, &o.Status, &o.Total, &o.Cluster, &o.ShippingAddress, &o.CreatedAt); err != nil {
			middleware.Error(w, "scan", http.StatusInternalServerError)
			return
		}
		orders = append(orders, o)
	}

	middleware.JSON(w, orders)
}

func (s *server) getOrder(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "orders.getOrder")
	defer span.End()

	claims, _ := middleware.ClaimsFrom(ctx)
	id := r.PathValue("id")

	var o Order
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, status, total::float8, cluster, shipping_address, created_at
		 FROM orders.orders WHERE id = $1 AND user_id = $2`, id, claims.UserID).
		Scan(&o.ID, &o.UserID, &o.Status, &o.Total, &o.Cluster, &o.ShippingAddress, &o.CreatedAt)
	if err != nil {
		middleware.Error(w, "order not found", http.StatusNotFound)
		return
	}

	rows, _ := s.pool.Query(ctx,
		`SELECT hat_id, quantity, price::float8 FROM orders.items WHERE order_id = $1`, id)
	defer rows.Close()
	for rows.Next() {
		var item OrderItem
		if err := rows.Scan(&item.HatID, &item.Quantity, &item.Price); err != nil {
			continue
		}
		o.Items = append(o.Items, item)
	}

	middleware.JSON(w, o)
}
