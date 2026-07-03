.PHONY: help dev dev-down build push deploy-a deploy-b observability lint test

CLUSTER_A ?= cluster-a
CLUSTER_B ?= cluster-b
IMAGE_PREFIX ?= ghcr.io/ovn-kubernetes/hat-shop
TAG ?= latest

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Local dev ─────────────────────────────────────────────────────────────────

dev: ## Run Hat Shop locally with podman kube play
	kubectl kustomize deploy/kubernetes/overlays/local | podman kube play -

dev-down: ## Tear down the local podman kube play stack
	kubectl kustomize deploy/kubernetes/overlays/local | podman kube play --down -

dev-replace: ## Rebuild and replace the local stack
	kubectl kustomize deploy/kubernetes/overlays/local | podman kube play --replace -

# ── Observability ─────────────────────────────────────────────────────────────

observability: ## Start the OTEL collector + Jaeger stack (outside k8s)
	docker compose -f deploy/observability/docker-compose.yml up -d

observability-down: ## Stop the observability stack
	docker compose -f deploy/observability/docker-compose.yml down

# ── Build ─────────────────────────────────────────────────────────────────────

build: ## Build all container images
	@for svc in catalogue orders carts payments shipping user front-end; do \
		echo "→ Building $$svc"; \
		docker build -f services/$$svc/Dockerfile \
			--build-arg CLUSTER_NAME=dev \
			-t $(IMAGE_PREFIX)/$$svc:$(TAG) .; \
	done

push: ## Push all images to GHCR
	@for svc in catalogue orders carts payments shipping user front-end; do \
		echo "→ Pushing $$svc"; \
		docker push $(IMAGE_PREFIX)/$$svc:$(TAG); \
	done

# ── Deploy ────────────────────────────────────────────────────────────────────

deploy-a: ## Deploy to cluster-a (uses current kubeconfig context)
	kubectl kustomize deploy/kubernetes/overlays/cluster-a | kubectl apply -f -

deploy-b: ## Deploy to cluster-b (uses current kubeconfig context)
	kubectl kustomize deploy/kubernetes/overlays/cluster-b | kubectl apply -f -

crdb-init: ## Initialise the CockroachDB cluster (run ONCE on cluster-a only)
	kubectl apply -f deploy/kubernetes/base/cockroachdb/init-job.yaml -n hat-shop

# ── CI ────────────────────────────────────────────────────────────────────────

lint: ## Run Go and TypeScript linters
	golangci-lint run ./services/... ./pkg/...
	cd services/front-end && npm run lint && npm run type-check

test: ## Run all Go tests
	go test ./services/... ./pkg/...

validate-manifests: ## Validate all Kustomize overlays
	@for overlay in base overlays/cluster-a overlays/cluster-b overlays/local; do \
		echo "→ Validating deploy/kubernetes/$$overlay"; \
		kubectl kustomize deploy/kubernetes/$$overlay > /dev/null; \
	done
	@echo "All manifests valid."
