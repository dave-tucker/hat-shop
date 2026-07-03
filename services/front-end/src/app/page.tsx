export default function Home() {
  const cluster = process.env.CLUSTER_NAME ?? "local";

  return (
    <div className="text-center py-16 space-y-6">
      <h1 className="text-5xl font-bold">🎩 Welcome to Hat Shop</h1>
      <p className="text-xl text-gray-600 max-w-2xl mx-auto">
        A multi-cluster microservices demo built on{" "}
        <strong>Plexus</strong> — OVN-Kubernetes&apos;s AdministrativeNetworkDomain
        stretches the same network across clusters so your app doesn&apos;t have to
        think about it.
      </p>
      <div className="inline-block bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-left space-y-2">
        <p className="text-sm text-gray-500">You are connected to</p>
        <p className="text-3xl font-mono font-bold text-blue-600">{cluster}</p>
        <p className="text-sm text-gray-500">
          Place an order here, then switch to the other cluster — your order
          will already be there.
        </p>
      </div>
      <div className="flex justify-center gap-4 pt-4">
        <a
          href="/catalogue"
          className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition"
        >
          Browse Hats
        </a>
        <a
          href="/orders"
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
        >
          My Orders
        </a>
      </div>
    </div>
  );
}
