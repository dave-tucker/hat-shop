# 🎩 Hat Shop

**A multi-cluster microservices demo powered by [Plexus](https://github.com/ovn-kubernetes) — OVN-Kubernetes's AdministrativeNetworkDomain (AND).**

Hat Shop is a simple e-commerce application for buying hats. It exists to demonstrate one thing: **state replication across Kubernetes clusters, enabled entirely by Plexus, with zero application-level sync code.**

Place an order on **Cluster A**. Switch to **Cluster B**. Your order is already there.

---

## Architecture

```mermaid
flowchart LR
  subgraph plexus["hat-shop namespace · ClusterUserDefinedNetwork · EVPN-stretched L2 via Plexus"]
    subgraph ca["Cluster A"]
      direction TB
      fe_a[front-end]
      cat_a[catalogue]
      ord_a[orders]
      cart_a[carts]
      pay_a[payments]
      ship_a[shipping]
      user_a[user]
    end

    subgraph infra["Plexus-stretched infrastructure"]
      direction TB
      crdb[(CockroachDB\nglobal cluster)]
      kafka{{Kafka KRaft\nglobal cluster}}
    end

    subgraph cb["Cluster B"]
      direction TB
      fe_b[front-end]
      cat_b[catalogue]
      ord_b[orders]
      cart_b[carts]
      pay_b[payments]
      ship_b[shipping]
      user_b[user]
    end

    ca -->|SQL| crdb
    cb -->|SQL| crdb
    ord_a -->|produce| kafka
    ship_a -->|consume| kafka
    ord_b -->|produce| kafka
    ship_b -->|consume| kafka
  end

  otel(["OTEL Collector\n+ Jaeger"])
  ca -.->|traces| otel
  cb -.->|traces| otel

  style plexus fill:#f0f4ff,stroke:#6366f1,stroke-width:2px
  style infra fill:#fafafa,stroke:#9ca3af,stroke-dasharray:5
  style crdb fill:#0f4c3a,color:#fff,stroke:none
  style kafka fill:#231f20,color:#fff,stroke:none
  style otel fill:#f97316,color:#fff,stroke:none
```

### Services

| Service     | Language   | Role                                              |
|-------------|------------|---------------------------------------------------|
| `front-end` | TypeScript | Next.js UI — shows cluster badge, catalogue, orders |
| `catalogue` | Go         | Hat listings — reads from CockroachDB             |
| `orders`    | Go         | Order creation — writes to CockroachDB, publishes to Kafka |
| `carts`     | Go         | Per-user cart — reads/writes CockroachDB          |
| `payments`  | Go         | Payment authorisation — writes to CockroachDB     |
| `shipping`  | Go         | Kafka consumer — creates shipment records in CockroachDB |
| `user`      | Go         | Registration, login (JWT)                         |

### Infrastructure

| Component      | Topology                                      |
|----------------|-----------------------------------------------|
| CockroachDB    | Single cluster, nodes split across clusters via Plexus EVPN |
| Kafka (KRaft)  | Single cluster, brokers split across clusters via Plexus EVPN |
| Observability  | OTEL SDK in every service → external collector + Jaeger |

### Cross-cluster DNS (Plexus)

Pods in the same AND namespace are resolvable across clusters as:

```
<hostname>.<subdomain>.<cudn-name>.svc.clusterset.local
```

CockroachDB and Kafka use cluster-specific subdomains (`crdb-a`, `crdb-b`, `kafka-a`, `kafka-b`) so the join lists scale to N clusters.

---

## Quickstart — local dev

Requires: `podman`, `kubectl` (for kustomize), `docker compose`

```bash
# Start the observability stack (Jaeger at http://localhost:16686)
make observability

# Deploy the full app locally via podman kube play
make dev

# Tear down
make dev-down
```

## Deploy to two clusters

```bash
# On cluster-a context
make deploy-a

# Initialise CockroachDB (once, on cluster-a only)
make crdb-init

# On cluster-b context
make deploy-b
```

Set `OTEL_COLLECTOR_HOST` in each overlay's `cluster-config-patch.yaml` to the IP of the host running `make observability`.

---

## The demo

1. Visit `http://<cluster-a-node>:30000` — note the **cluster-a** badge
2. Register an account, browse the catalogue, add hats to your cart, place an order
3. Visit `http://<cluster-b-node>:30000` — note the **cluster-b** badge  
4. Log in with the same credentials — your order history is already there
5. Open Jaeger at `http://localhost:16686` — find the `orders` trace and see spans from both clusters

---

## Repository layout

```
hat-shop/
├── go.work                        Go workspace (all backend services)
├── Makefile
├── services/
│   ├── catalogue/                 Go service + Dockerfile
│   ├── orders/
│   ├── carts/
│   ├── payments/
│   ├── shipping/
│   ├── user/
│   └── front-end/                 Next.js + TypeScript + Dockerfile
├── pkg/
│   ├── db/                        Shared CockroachDB pool
│   ├── middleware/                HTTP middleware (auth, logging, OTEL)
│   └── tracing/                   OTEL initialisation
├── deploy/
│   ├── kubernetes/
│   │   ├── base/                  Kustomize base manifests
│   │   └── overlays/
│   │       ├── cluster-a/         cluster-a patches (CRDB/Kafka join lists)
│   │       ├── cluster-b/
│   │       └── local/             podman kube play (single-node CRDB + Kafka)
│   └── observability/             docker-compose: OTEL collector + Jaeger
└── docs/
    └── architecture.md
```

---

## About Plexus

Plexus is OVN-Kubernetes's multi-cluster networking layer. The **AdministrativeNetworkDomain (AND)** concept provides:

- **(a)** Namespace same-ness across clusters
- **(b)** Per-namespace `ClusterUserDefinedNetwork` (OVN-K8s)
- **(c)** EVPN-stretched L2 network between clusters
- **(d)** Multi-cluster DNS (`*.svc.clusterset.local`)

Hat Shop requires no multi-cluster-aware application code. CockroachDB and Kafka form single global clusters because Plexus makes the network look flat.
