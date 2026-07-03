"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/use-auth";

interface Order {
  id: string;
  status: string;
  total: number;
  cluster: string;
  shipping_address: string;
  created_at: string;
}

export default function OrdersPage() {
  const auth    = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    if (!auth) return;
    fetch("/api/orders", { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.ok ? r.json() : Promise.reject("Failed to load orders"))
      .then(data => { setOrders(data ?? []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [auth]);

  if (!auth || loading) return <p className="text-gray-400 text-sm">Loading…</p>;
  if (error)            return <p className="text-red-600">{error}</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">My Orders</h1>
      {orders.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">🎩</p>
          <p>No orders yet — browse the catalogue and buy a hat!</p>
        </div>
      )}
      <div className="space-y-4">
        {orders.map(order => (
          <div key={order.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-sm text-gray-400">#{order.id.slice(0, 8)}</p>
                <p className="font-semibold text-lg mt-1">${order.total.toFixed(2)}</p>
              </div>
              <div className="text-right space-y-1">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  order.status === "pending"   ? "bg-yellow-100 text-yellow-800" :
                  order.status === "paid"      ? "bg-blue-100 text-blue-800" :
                  order.status === "shipped"   ? "bg-purple-100 text-purple-800" :
                  order.status === "delivered" ? "bg-green-100 text-green-800" :
                                                 "bg-gray-100 text-gray-800"
                }`}>
                  {order.status}
                </span>
                {/* The cluster badge here is the money shot — shows which cluster
                    WROTE this order, proving cross-cluster replication. */}
                <p className="text-xs text-gray-400">
                  placed on{" "}
                  <span className="font-medium text-gray-600">{order.cluster}</span>
                </p>
              </div>
            </div>
                {order.shipping_address && (
                  <p className="text-xs font-mono text-gray-400 mt-2">
                    📦 {order.shipping_address}
                  </p>
                )}
            <p className="text-xs text-gray-400 mt-2">
              {new Date(order.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
