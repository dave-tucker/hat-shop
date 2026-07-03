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
	name       TEXT NOT NULL UNIQUE,
	description TEXT NOT NULL,
	price      NUMERIC(10,2) NOT NULL,
	image_url  TEXT NOT NULL,
	stock      INT NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO catalogue.hats (name, description, price, image_url, stock)
VALUES
	('The Plexus Fedora',
	 'A wide-brimmed fedora in deep navy wool felt, hand-blocked into a classic teardrop crown. The hatband is woven from a custom jacquard ribbon printed with a repeating network-topology graph in silver thread — nodes and edges that wrap all the way around. The brim edge is bound in the same silver grosgrain. Inspired by Plexus''s AdministrativeNetworkDomain: every node in the pattern connects to every other, across any distance.',
	 49.99, '/images/fedora.png', 100),
	('OVN Outback',
	 'A wide-brimmed bush hat in weathered khaki cotton canvas, inspired by the Australian outback. The leather chinstrap and sweatband are hand-stitched. A cluster of five small metallic cork charms hang from the left brim — one for each Kubernetes node in a typical HA control plane. The crown is ventilated with six brass eyelets. Built for multi-region deployments and actual deserts.',
	 39.99, '/images/outback.png', 50),
	('CockroachDB Cap',
	 'A six-panel structured baseball cap in deep espresso brown with a low-profile crown. The front panel carries a subtle embroidered cockroach silhouette in tonal stitching — visible only in raking light, like a hidden easter egg. The underbrim is iridescent amber. Snapback closure with a custom metal buckle stamped with the words SURVIVES EVERYTHING. Inspired by CockroachDB''s legendary tolerance for failure.',
	 24.99, '/images/cap.png', 200),
	('EVPN Beret',
	 'A generously oversized French beret in midnight black boiled wool — the kind that flops dramatically to one side, as if already stretched across a second cluster. The leather sweatband is stamped with the MAC address DE:AD:BE:EF:00:01 in gold foil. A single flat grosgrain ribbon is woven in a figure-eight around the crown, suggesting an EVPN Type-2 route advertisement. Sized to fit any head, across any failure domain.',
	 34.99, '/images/beret.png', 75),
	('KRaft Kaftan Hat',
	 'A wide-brimmed sun hat constructed from undyed raw linen. The brim is wide enough to provide genuine consensus coverage. The crown is tall and cylindrical, wrapped in a thin cord in a geometric pattern that traces a Raft state machine — leader, follower, candidate — in terracotta and ochre thread. No ZooKeeper required. No coordination overhead. Just the hat and the sun.',
	 29.99, '/images/kaftan.png', 120),
	('Kubernetes Kombat Helmet',
	 'A matte midnight-blue tactical combat helmet with a modern ballistic shell profile. The exterior carries a subtle embossed Kubernetes helm-wheel motif across the crown — the same eight-spoke design as the project logo, rendered in Kubernetes blue as a raised lacquered inlay. A cloth patch on the left side reads PROD SINCE 2014 in military stencil font. Battle-tested. Production-hardened. Never goes down without a fight.',
	 59.99, '/images/helmet.png', 30)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
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
	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		slog.Error("http shutdown", "err", err)
	}
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
