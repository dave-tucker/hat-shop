// Package tracing initialises an OpenTelemetry tracer that exports spans via
// OTLP HTTP to the endpoint specified by OTEL_EXPORTER_OTLP_ENDPOINT.
package tracing

import (
	"context"
	"fmt"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.25.0"
	"go.opentelemetry.io/otel/trace"
)

// Init configures the global OTEL tracer for the named service.
// It returns a shutdown function that must be called on exit.
// If OTEL_EXPORTER_OTLP_ENDPOINT is not set, a no-op tracer is used.
func Init(ctx context.Context, serviceName string) (trace.Tracer, func(context.Context) error, error) {
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" {
		tp := sdktrace.NewTracerProvider()
		otel.SetTracerProvider(tp)
		return tp.Tracer(serviceName), tp.Shutdown, nil
	}

	exp, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("creating OTLP exporter: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(semconv.ServiceName(serviceName)),
		resource.WithAttributes(semconv.DeploymentEnvironment(clusterName())),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("creating resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	return tp.Tracer(serviceName), tp.Shutdown, nil
}

// clusterName returns the CLUSTER_NAME env var, defaulting to "unknown".
// This is injected by the Kustomize overlay so traces are tagged per-cluster.
func clusterName() string {
	if n := os.Getenv("CLUSTER_NAME"); n != "" {
		return n
	}
	return "unknown"
}
