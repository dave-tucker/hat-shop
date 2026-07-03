"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { HatImage } from "@/components/HatImage";
import type { Hat } from "@/lib/api";

interface OrderItem { hat_id: string; quantity: number; price: number; }
interface Timeline {
  placed_at:  string | null;
  paid_at:    string | null;
  shipped_at: string | null;
  address:    string | null;
}
interface OrderDetail {
  id: string;
  status: string;
  total: number;
  cluster: string;
  shipping_address: string;
  created_at: string;
  items: OrderItem[];
  timeline: Timeline;
}

const STATUS_STEPS = [
  { key: "pending",   label: "Order Placed",          field: "placed_at"  as const },
  { key: "paid",      label: "Payment Confirmed",      field: "paid_at"    as const },
  { key: "shipped",   label: "Shipped",                field: "shipped_at" as const },
  { key: "delivered", label: "Delivered",              field: null },
];

function fmt(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium", timeStyle: "short",
  });
}

function statusIndex(status: string) {
  return STATUS_STEPS.findIndex(s => s.key === status);
}

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const auth = useAuth("/login");
  const [order,     setOrder]     = useState<OrderDetail | null>(null);
  const [catalogue, setCatalogue] = useState<Hat[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!auth) return;
    Promise.all([
      fetch(`/api/order?id=${params.id}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      }).then(r => r.ok ? r.json() : null),
      fetch("/api/catalogue").then(r => r.ok ? r.json() : []),
    ]).then(([ord, cat]) => {
      setOrder(ord);
      setCatalogue(cat ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [auth, params.id]);

  const hat = (id: string) => catalogue.find(h => h.id === id);

  if (!auth || loading) return <p className="text-gray-400 text-sm">Loading…</p>;
  if (!order) return <p className="text-red-500">Order not found.</p>;

  const currentStep = statusIndex(order.status);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400">
        <a href="/orders" className="hover:underline">Orders</a>
        <span className="mx-2">/</span>
        <span className="text-gray-700 font-mono">#{order.id.slice(0, 8)}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono">#{order.id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-400 mt-1">
            Placed on <span className="font-medium text-gray-600">{order.cluster}</span>
            {" · "}{fmt(order.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">${order.total.toFixed(2)}</p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            order.status === "pending"   ? "bg-yellow-100 text-yellow-800" :
            order.status === "paid"      ? "bg-blue-100 text-blue-800" :
            order.status === "shipped"   ? "bg-purple-100 text-purple-800" :
            order.status === "delivered" ? "bg-green-100 text-green-800" :
                                           "bg-gray-100 text-gray-800"
          }`}>{order.status}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-5">
          Order Timeline
        </h2>
        <ol className="relative border-l border-gray-200 space-y-6 ml-3">
          {STATUS_STEPS.map((step, idx) => {
            const done      = idx <= currentStep;
            const timestamp = step.field ? order.timeline[step.field] : null;
            return (
              <li key={step.key} className="ml-6">
                <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white ${
                  done ? "bg-gray-900" : "bg-gray-200"
                }`}>
                  {done
                    ? <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    : <span className="w-2 h-2 rounded-full bg-gray-400"/>
                  }
                </span>
                <div>
                  <p className={`font-medium text-sm ${done ? "text-gray-900" : "text-gray-400"}`}>
                    {step.label}
                  </p>
                  {timestamp && (
                    <p className="text-xs text-gray-400 mt-0.5">{fmt(timestamp)}</p>
                  )}
                  {step.key === "shipped" && done && order.timeline.address && (
                    <p className="text-xs font-mono text-gray-400 mt-0.5">
                      📦 {order.timeline.address}
                    </p>
                  )}
                  {!done && !timestamp && (
                    <p className="text-xs text-gray-300 mt-0.5">Pending…</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-sm text-gray-500 uppercase tracking-wide">
          Items
        </div>
        <div className="divide-y divide-gray-50">
          {(order.items ?? []).map((item, i) => {
            const h = hat(item.hat_id);
            return (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-50">
                  <HatImage
                    src={h?.image_url ?? ""}
                    alt={h?.name ?? item.hat_id}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {h?.name ?? item.hat_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ${item.price.toFixed(2)} × {item.quantity}
                  </p>
                </div>
                <p className="font-semibold text-sm shrink-0">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-center px-5 py-4 border-t border-gray-100 font-bold">
          <span>Total</span>
          <span>${order.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
