# Hat Shop — Architecture

## Plexus AND topology

All Hat Shop workloads live in a single `hat-shop` namespace. An OVN-Kubernetes `ClusterUserDefinedNetwork` (CUDN) gives that namespace a dedicated Layer2 network segment. Plexus stretches this segment across participating clusters via EVPN, making pod IPs from both clusters routable to each other without any overlay or tunnelling visible to the application.

## CockroachDB cluster formation

Each cluster runs a `cockroachdb` StatefulSet with 2 replicas. Pods are assigned a cluster-specific subdomain (`crdb-a` on cluster-a, `crdb-b` on cluster-b). This makes each pod reachable as:

```
# Within the same cluster
cockroachdb-0.crdb-a.hat-shop.svc.cluster.local

# From the other cluster (Plexus DNS)
cockroachdb-0.crdb-a.hat-shop.svc.clusterset.local
```

The `--join` flag on each pod lists 1–2 bootstrap addresses from each cluster. CockroachDB gossip protocol discovers the remaining members after initial cluster formation. The `--cluster-name=hat-shop` flag prevents accidental cross-cluster joins.

`cockroach init` is run once, manually, on cluster-a after the StatefulSet is Ready. Cluster-b nodes join the existing cluster via the `clusterset.local` join addresses.

## Kafka KRaft cluster formation

The same subdomain pattern applies to Kafka: `kafka-a` / `kafka-b`. Kafka node IDs are statically assigned: cluster-a brokers get IDs 0,1; cluster-b brokers get IDs 2,3. The KRaft `KAFKA_CONTROLLER_QUORUM_VOTERS` env var lists all four nodes across both clusters.

## Data flow

```
User → front-end
  → user service       (register / login → JWT)
  → catalogue service  (list hats)
  → carts service      (add to cart)
  → payments service   (authorise payment)
  → orders service     (create order → Kafka: orders.created)
                            ↓
                    shipping service   (consume Kafka → write shipment to CRDB)
```

All writes go to CockroachDB, which replicates them synchronously across all nodes regardless of which cluster they are on. A user on cluster-b reading their order history sees writes that were made on cluster-a with no application-level synchronisation.

## Observability

Every service initialises an OTEL `TracerProvider` pointing at the external OTEL collector. Trace context is propagated via HTTP headers (`traceparent`) between services. Because all services on both clusters report to the same collector, a single Jaeger trace can show spans from cluster-a and cluster-b in the same waterfall.

The `CLUSTER_NAME` env var (injected by Kustomize overlay) is attached to every span as the `deployment.environment` resource attribute, making it easy to filter by cluster in Jaeger.

## Local development

`overlays/local/` patches the StatefulSets to single-node Deployments (Podman does not support StatefulSet). CockroachDB runs in `start-single-node` mode. Kafka runs as a single KRaft broker. The application is otherwise identical to production.

```bash
make observability   # start Jaeger + OTEL collector
make dev             # kubectl kustomize overlays/local | podman kube play -
```
