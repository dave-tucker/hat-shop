"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HatLogo } from "@/components/HatLogo";
import { useAuth } from "@/lib/use-auth";
import { useCart } from "@/lib/cart-context";

interface CartItem { id: string; hat_id: string; quantity: number; }
interface Hat      { id: string; name: string; price: number; }

const LOCATIONS = [
  {
    id:      "default-gateway",
    label:   "Default Gateway",
    address: "Default Gateway — 0.0.0.0, The Internet",
    note:    "Routed to whoever answers ARP first.",
  },
  {
    id:      "dev-null",
    label:   "/dev/null",
    address: "/dev/null — Bit Bucket Lane, The Void",
    note:    "Hat will be permanently redirected to the kernel.",
  },
  {
    id:      "bgp-blackhole",
    label:   "BGP Blackhole",
    address: "BGP Blackhole — AS64512, Null Route, Nowhere",
    note:    "Traffic accepted but never delivered. NXDOMAIN for physical mail.",
  },
];

export default function CheckoutPage() {
  const router  = useRouter();
  const auth    = useAuth("/login");
  const { refresh } = useCart();

  const [items, setItems]         = useState<CartItem[]>([]);
  const [hats, setHats]           = useState<Hat[]>([]);
  const [tokens, setTokens]       = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [location, setLocation]   = useState(LOCATIONS[0].id);
  const [placing, setPlacing]     = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    if (!auth) return;
    Promise.all([
      fetch(`/api/cart?userId=${auth.userId}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      }).then(r => r.json()),
      fetch("/api/catalogue").then(r => r.json()),
      fetch(`/api/tokens?userId=${auth.userId}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      }).then(r => r.json()),
    ]).then(([cart, catalogue, bal]) => {
      setItems(cart.items ?? []);
      setHats(catalogue ?? []);
      setTokens(bal.tokens ?? 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [auth]);

  const hatName  = (id: string) => hats.find(h => h.id === id)?.name ?? id.slice(0, 8);
  const hatPrice = (id: string) => hats.find(h => h.id === id)?.price ?? 0;
  const total    = items.reduce((s, i) => s + hatPrice(i.hat_id) * i.quantity, 0);
  const tokenCost = Math.ceil(total);
  const afterTokens = (tokens ?? 0) - tokenCost;
  const canAfford = afterTokens >= 0;
  const selectedLocation = LOCATIONS.find(l => l.id === location)!;

  async function handlePay() {
    if (!auth || !canAfford) return;
    setPlacing(true);
    setError("");
    try {
      const orderItems = items.map(i => ({
        hat_id:   i.hat_id,
        quantity: i.quantity,
        price:    hatPrice(i.hat_id),
      }));
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({
          items:            orderItems,
          total,
          user_id:          auth.userId,
          shipping_address: selectedLocation.address,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Checkout failed");
      }
      refresh();
      router.push("/orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setPlacing(false);
    }
  }

  if (!auth || loading) return <p className="text-gray-400 text-sm">Loading…</p>;

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-5xl mb-4">🛒</p>
        <p>Your cart is empty.</p>
        <a href="/catalogue" className="mt-4 inline-block text-sm underline">Browse hats</a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Checkout</h1>

      {/* Order summary */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-sm text-gray-500 uppercase tracking-wide">
          Order Summary
        </div>
        {items.map(item => (
          <div key={item.id} className="flex justify-between items-center px-5 py-3 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <HatLogo className="w-4 h-3 text-gray-400 shrink-0" />
              <span className="text-sm">{hatName(item.hat_id)}</span>
              <span className="text-xs text-gray-400">× {item.quantity}</span>
            </div>
            <span className="text-sm font-medium">
              {Math.ceil(hatPrice(item.hat_id) * item.quantity)} tokens
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center px-5 py-4 font-bold">
          <span>Total</span>
          <span>{tokenCost} tokens</span>
        </div>
      </div>

      {/* Token balance */}
      <div className={`rounded-xl border p-5 ${canAfford ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-600">Token Balance</p>
            <p className="text-2xl font-bold mt-0.5">{tokens ?? "…"} tokens</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">After purchase</p>
            <p className={`text-2xl font-bold mt-0.5 ${canAfford ? "text-emerald-600" : "text-red-600"}`}>
              {afterTokens} tokens
            </p>
          </div>
        </div>
        {!canAfford && (
          <p className="mt-3 text-sm text-red-600 font-medium">
            Insufficient tokens — you need {tokenCost - (tokens ?? 0)} more.
          </p>
        )}
      </div>

      {/* Shipping location */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-sm text-gray-500 uppercase tracking-wide">
          Shipping Destination
        </div>
        <div className="divide-y divide-gray-50">
          {LOCATIONS.map(loc => (
            <label
              key={loc.id}
              className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition ${
                location === loc.id ? "bg-gray-50" : "hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="location"
                value={loc.id}
                checked={location === loc.id}
                onChange={() => setLocation(loc.id)}
                className="mt-1 shrink-0"
              />
              <div>
                <p className="font-semibold text-sm">{loc.label}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{loc.address}</p>
                <p className="text-xs text-gray-500 mt-1 italic">{loc.note}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Error + Pay button */}
      {error && (
        <div className="px-5 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={placing || !canAfford}
        className="w-full py-4 bg-gray-900 text-white rounded-xl font-semibold text-lg hover:bg-gray-700 disabled:opacity-40 transition"
      >
        {placing
          ? "Processing…"
          : `Pay ${tokenCost} tokens · Ship to ${selectedLocation.label}`}
      </button>

      <a href="/cart" className="block text-center text-sm text-gray-400 hover:underline">
        ← Back to cart
      </a>
    </div>
  );
}
