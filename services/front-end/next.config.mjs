/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    // All values read from ENV at build time (set via Dockerfile ARG → ENV).
    // For compose: defaults bake in compose service names.
    // For k8s: pass --build-arg overrides in the Kustomize/CI pipeline.
    CLUSTER_NAME:   process.env.CLUSTER_NAME   ?? "local",
    CATALOGUE_URL:  process.env.CATALOGUE_URL  ?? "http://catalogue:8080",
    ORDERS_URL:     process.env.ORDERS_URL     ?? "http://orders:8080",
    CARTS_URL:      process.env.CARTS_URL      ?? "http://carts:8080",
    PAYMENTS_URL:   process.env.PAYMENTS_URL   ?? "http://payments:8080",
    SHIPPING_URL:   process.env.SHIPPING_URL   ?? "http://shipping:8080",
    USER_URL:       process.env.USER_URL       ?? "http://user:8080",
  },
  async rewrites() {
    // In production these are separate k8s Services. In local dev they can
    // point to individually-running service processes.
    return [
      { source: "/api/catalogue/:path*", destination: `${process.env.CATALOGUE_URL ?? "http://localhost:8081"}/:path*` },
      { source: "/api/orders/:path*",    destination: `${process.env.ORDERS_URL    ?? "http://localhost:8082"}/:path*` },
      { source: "/api/carts/:path*",     destination: `${process.env.CARTS_URL     ?? "http://localhost:8083"}/:path*` },
      { source: "/api/payments/:path*",  destination: `${process.env.PAYMENTS_URL  ?? "http://localhost:8084"}/:path*` },
      { source: "/api/shipping/:path*",  destination: `${process.env.SHIPPING_URL  ?? "http://localhost:8085"}/:path*` },
      { source: "/api/user/:path*",      destination: `${process.env.USER_URL      ?? "http://localhost:8086"}/:path*` },
    ];
  },
};

export default nextConfig;

