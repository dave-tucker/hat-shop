"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { HatImage } from "@/components/HatImage";
import type { Hat } from "@/lib/api";

interface OrderItem { hat_id: string; quantity: number; price: number; }
interface Order {
  id: string;
  status: string;
  total: number;
  cluster: string;
  shipping_address: string;
  created_at: string;
  items: OrderItem[];
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "pending"   ? "bg-yellow-100 text-yellow-800" :
    status === "paid"      ? "bg-blue-100 text-blue-800"     :
    status === "shipped"   ? "bg-purple-100 text-purple-800" :
    status === "delivered" ? "bg-green-100 text-green-800"   :
    status === "cancelled" ? "bg-red-100 text-red-800"       :
                             "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export default function OrdersPage() {
  const auth    = useAuth();
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [catalogue, setCatalogue] = useState<Hat[]>([]);
  const [tokens,    setTokens]    = useState<number | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (!auth) return;
    Promise.all([
      fetch("/api/orders", { headers: { Authorization: `Bearer ${auth.token}` } })
        .then(r => r.ok ? r.json() : []),
      fetch("/api/catalogue").then(r => r.ok ? r.json() : []),
      fetch(`/api/tokens?userId=${auth.userId}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      }).then(r => r.ok ? r.json() : {}),
    ])
      .then(([data, cat, bal]: [Order[], Hat[], Record<string, number>]) => {
        setOrders(data ?? []);
        setCatalogue(cat ?? []);
        setTokens(bal.tokens ?? null);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [auth]);

  const hat = (id: string) => catalogue.find(h => h.id === id);

  if (!auth || loading) return <p className="text-gray-400 text-sm">Loading…</p>;
  if (error)            return <p className="text-red-600">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">My Orders</h1>
        {tokens !== null && (
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Token Balance</p>
            <p className="text-2xl font-bold">{tokens}</p>
          </div>
        )}
      </div>

      {orders.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">🎩</p>
          <p>No orders yet — browse the catalogue and buy a hat!</p>
        </div>
      )}

      <div className="space-y-4">
        {orders.map(order => (
          <a
            key={order.id}
            href={`/orders/${order.id}`}
            className="block bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition"
          >
            {/* Header row */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono text-sm text-gray-400">#{order.id.slice(0, 8)}</p>
                <p className="font-semibold text-lg mt-0.5">${order.total.toFixed(2)}</p>
              </div>
              <div className="text-right space-y-1">
                <StatusBadge status={order.status} />
                <p className="text-xs text-gray-400">
                  placed on{" "}
                  <span className="font-medium text-gray-600">{order.cluster}</span>
                </p>
              </div>
            </div>

            {/* Product image strip with qty badges */}
            {(order.items ?? []).length > 0 && (
              <div className="flex gap-2 mb-3">
                {(order.items ?? []).slice(0, 6).map((item, i) => {
                  const h = hat(item.hat_id);
                  return (
                    <div key={i} className="relative w-14 h-14 shrink-0">
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
                        <HatImage
                          src={h?.image_url ?? ""}
                          alt={h?.name ?? ""}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {item.quantity > 1 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1
                          bg-gray-900 text-white text-[10px] font-bold rounded-full
                          flex items-center justify-center leading-none">
                          {item.quantity}
                        </span>
                      )}
                    </div>
                  );
                })}
                {(order.items ?? []).length > 6 && (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center
                    text-xs text-gray-500 font-medium shrink-0">
                    +{order.items.length - 6}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between">
              {order.shipping_address && (
                <p className="text-xs font-mono text-gray-400 truncate flex-1 mr-4">
                  📦 {order.shipping_address}
                </p>
              )}
              <p className="text-xs text-gray-400 shrink-0">
                {new Date(order.created_at).toLocaleString(undefined, {
                  dateStyle: "medium", timeStyle: "short",
                })}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
