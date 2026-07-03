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
	tracking_ref TEXT,
	cluster      TEXT NOT NULL,
	updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

// statusProgression defines the order of shipping states.
var statusProgression = []string{"preparing", "shipped", "delivered"}

type Shipment struct {
	ID          string    `json:"id"`
	OrderID     string    `json:"order_id"`
	Status      string    `json:"status"`
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
	defer shutdown(context.Background())

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

	// Start Kafka consumer in background.
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
	httpSrv.Shutdown(shutdownCtx)
}

// consumeOrders reads from the orders.created Kafka topic and creates shipments.
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
				return // graceful shutdown
			}
			slog.Error("kafka read", "err", err)
			continue
		}

		var event struct {
			OrderID string `json:"order_id"`
		}
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			slog.Error("unmarshal", "err", err)
			continue
		}

		_, err = s.pool.Exec(ctx,
			`INSERT INTO shipping.shipments (order_id, cluster)
			 VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING`,
			event.OrderID, cluster)
		if err != nil {
			slog.Error("insert shipment", "err", err, "order_id", event.OrderID)
		} else {
			slog.Info("shipment created", "order_id", event.OrderID, "cluster", cluster)
		}
	}
}

func (s *server) getShipment(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "shipping.getShipment")
	defer span.End()

	orderID := r.PathValue("orderId")
	var sh Shipment
	err := s.pool.QueryRow(ctx,
		`SELECT id, order_id, status, COALESCE(tracking_ref,''), cluster, updated_at
		 FROM shipping.shipments WHERE order_id = $1`, orderID).
		Scan(&sh.ID, &sh.OrderID, &sh.Status, &sh.TrackingRef, &sh.Cluster, &sh.UpdatedAt)
	if err != nil {
		middleware.Error(w, "shipment not found", http.StatusNotFound)
		return
	}

	middleware.JSON(w, sh)
}
