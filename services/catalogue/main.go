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
CREATE SCHEMA IF NOT EXISTS catalogue;

CREATE TABLE IF NOT EXISTS catalogue.hats (
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name       TEXT NOT NULL,
	description TEXT NOT NULL,
	price      NUMERIC(10,2) NOT NULL,
	image_url  TEXT NOT NULL,
	stock      INT NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO catalogue.hats (name, description, price, image_url, stock)
VALUES
	('The Plexus Fedora',    'A wide-brimmed hat as distributed as your network.',  49.99, '/images/fedora.png',    100),
	('OVN Outback',          'Rugged. Multi-cluster ready. Corks optional.',         39.99, '/images/outback.png',   50),
	('CockroachDB Cap',      'Survives split-brain. Machine-washable.',              24.99, '/images/cap.png',       200),
	('EVPN Beret',           'Stretches to fit any head, across any cluster.',       34.99, '/images/beret.png',     75),
	('KRaft Kaftan Hat',     'Coordination-free. Zookeeper not included.',           29.99, '/images/kaftan.png',    120),
	('Kubernetes Kombat Helmet', 'Battle-tested in production since 2014.',          59.99, '/images/helmet.png',   30)
ON CONFLICT DO NOTHING;
`

type Hat struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	ImageURL    string  `json:"image_url"`
	Stock       int     `json:"stock"`
}

type server struct {
	pool   *pgxpool.Pool
	tracer trace.Tracer
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	tracer, shutdown, err := tracing.Init(ctx, "catalogue")
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

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", middleware.Health())
	mux.HandleFunc("GET /catalogue", srv.listHats)
	mux.HandleFunc("GET /catalogue/{id}", srv.getHat)

	handler := middleware.OTELPropagation(middleware.Logging(mux))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	httpSrv := &http.Server{Addr: ":" + port, Handler: handler}

	go func() {
		slog.Info("catalogue service listening", "port", port)
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

func (s *server) listHats(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "catalogue.listHats")
	defer span.End()

	rows, err := s.pool.Query(ctx,
		`SELECT id, name, description, price::float8, image_url, stock FROM catalogue.hats ORDER BY name`)
	if err != nil {
		middleware.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	hats := []Hat{}
	for rows.Next() {
		var h Hat
		if err := rows.Scan(&h.ID, &h.Name, &h.Description, &h.Price, &h.ImageURL, &h.Stock); err != nil {
			middleware.Error(w, "scan failed", http.StatusInternalServerError)
			return
		}
		hats = append(hats, h)
	}

	middleware.JSON(w, hats)
}

func (s *server) getHat(w http.ResponseWriter, r *http.Request) {
	ctx, span := s.tracer.Start(r.Context(), "catalogue.getHat")
	defer span.End()

	id := r.PathValue("id")
	var h Hat
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, description, price::float8, image_url, stock FROM catalogue.hats WHERE id = $1`, id).
		Scan(&h.ID, &h.Name, &h.Description, &h.Price, &h.ImageURL, &h.Stock)
	if err != nil {
		middleware.Error(w, "hat not found", http.StatusNotFound)
		return
	}

	middleware.JSON(w, h)
}

// Ensure Hat is JSON-serialisable (compile-time check).
var _ json.Marshaler = (*Hat)(nil)

func (h *Hat) MarshalJSON() ([]byte, error) {
	type Alias Hat
	return json.Marshal((*Alias)(h))
}
