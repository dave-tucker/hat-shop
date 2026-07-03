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
	"github.com/segmentio/kafka-go"
	"go.opentelemetry.io/otel/trace"
)

const migration = `
CREATE SCHEMA IF NOT EXISTS shipping;

CREATE TABLE IF NOT EXISTS shipping.shipments (
	id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	order_id     UUID NOT NULL UNIQUE,
	status       TEXT NOT NULL DEFAULT 'preparing',
	address      TEXT NOT NULL DEFAULT '',
	tracking_ref TEXT,
	cluster      TEXT NOT NULL,
	updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shipping.shipments ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
`

// shippingDelay returns the time to wait before marking an order shipped.
// Override with SHIPPING_DELAY env var (e.g. "10s", "1m"). Default: 30s.
func shippingDelay() time.Duration {
	if d := os.Getenv("SHIPPING_DELAY"); d != "" {
		if parsed, err := time.ParseDuration(d); err == nil {
			return parsed
		}
	}
	return 30 * time.Second
}

// Shipping locations — network-themed delivery addresses.
var locations = map[string]string{
	"default-gateway": "Default Gateway — 0.0.0.0, The Internet",
	"dev-null":        "/dev/null — Bit Bucket Lane, The Void",
	"bgp-blackhole":   "BGP Blackhole — AS64512, Null Route, Nowhere",
}

type Shipment struct {
	ID          string    `json:"id"`
	OrderID     string    `json:"order_id"`
	Status      string    `json:"status"`
	Address     string    `json:"address"`
	TrackingRef string    `json:"tracking_ref,omitempty"`
	Cluster     string    `json:"cluster"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type server struct {
	pool   *pgxpool.Pool
	tracer trace.Tracer
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	tracer, shutdown, err := tracing.Init(ctx, "shipping")
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
	go srv.consumeOrders(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", middleware.Health())
	mux.HandleFunc("GET /shipping/{orderId}", srv.getShipment)

	handler := middleware.OTELPropagation(middleware.Logging(mux))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	httpSrv := &http.Server{Addr: ":" + port, Handler: handler}
	go func() {
		slog.Info("shipping service listening", "port", port)
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

func (s *server) consumeOrders(ctx context.Context) {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  []string{os.Getenv("KAFKA_ADDR")},
		Topic:    "orders.created",
		GroupID:  "shipping",
		MinBytes: 1,
		MaxBytes: 1e6,
	})
	defer r.Close()

	cluster := os.Getenv("CLUSTER_NAME")
	if cluster == "" {
		cluster = "local"
	}

	for {
		msg, err := r.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			slog.Error("kafka read", "err", err)
			continue
		}

		var event struct {
			OrderID         string `json:"order_id"`
			ShippingAddress string `json:"shipping_address"`
		}
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			slog.Error("unmarshal", "err", err)
			continue
		}

		tag, err := s.pool.Exec(ctx,
			`INSERT INTO shipping.shipments (order_id, address, cluster)
			 VALUES ($1, $2, $3) ON CONFLICT (order_id) DO NOTHING`,
			event.OrderID, event.ShippingAddress, cluster)
		if err != nil {
			slog.Error("insert shipment", "err", err, "order_id", event.OrderID)
			continue
		}
		if tag.RowsAffected() == 0 {
			continue // already processed
		}

		slog.Info("shipment preparing", "order_id", event.OrderID, "address", event.ShippingAddress,
			"delay", shippingDelay())

		// Fire-and-forget goroutine: wait the shipping delay then mark as shipped.
		go func(orderID string) {
			time.Sleep(shippingDelay())

			_, err := s.pool.Exec(context.Background(),
				`UPDATE shipping.shipments SET status = 'shipped', updated_at = now()
				 WHERE order_id = $1`, orderID)
			if err != nil {
				slog.Error("shipment status update", "err", err, "order_id", orderID)
				return
			}

			// Transition order: paid → shipped (cross-schema, same CockroachDB cluster).
			_, err = s.pool.Exec(context.Background(),
				`UPDATE orders.orders SET status = 'shipped' WHERE id = $1`, orderID)
			if err != nil {
				slog.Error("order status update", "err", err, "order_id", orderID)
			}
			slog.Info("shipment shipped", "order_id", orderID)
		}(event.OrderID)
	}
}

func (s *server) getShipment(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "shipping.getShipment")
	defer span.End()

	orderID := r.PathValue("orderId")
	var sh Shipment
	err := s.pool.QueryRow(ctx,
		`SELECT id, order_id, status, address, COALESCE(tracking_ref,''), cluster, updated_at
		 FROM shipping.shipments WHERE order_id = $1`, orderID).
		Scan(&sh.ID, &sh.OrderID, &sh.Status, &sh.Address, &sh.TrackingRef, &sh.Cluster, &sh.UpdatedAt)
	if err != nil {
		middleware.Error(w, "shipment not found", http.StatusNotFound)
		return
	}
	middleware.JSON(w, sh)
}
