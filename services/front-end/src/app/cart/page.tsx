"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HatLogo } from "@/components/HatLogo";

interface CartItem { id: string; hat_id: string; quantity: number; }
interface Hat { id: string; name: string; price: number; }

export default function CartPage() {
  const router = useRouter();
  const [items, setItems]     = useState<CartItem[]>([]);
  const [hats, setHats]       = useState<Hat[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    const token  = localStorage.getItem("token");
    const userId = localStorage.getItem("user_id");
    if (!token || !userId) { setLoading(false); return; }

    Promise.all([
      fetch(`/api/cart?userId=${userId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`/api/catalogue`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([cart, catalogue]) => {
      setItems(cart.items ?? []);
      setHats(catalogue ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const hatName  = (id: string) => hats.find(h => h.id === id)?.name ?? id.slice(0, 8);
  const hatPrice = (id: string) => hats.find(h => h.id === id)?.price ?? 0;
  const total    = items.reduce((s, i) => s + hatPrice(i.hat_id) * i.quantity, 0);

  async function placeOrder() {
    const token  = localStorage.getItem("token");
    const userId = localStorage.getItem("user_id");
    if (!token || !userId) return;
    setPlacing(true);
    try {
      const orderItems = items.map(i => ({ hat_id: i.hat_id, quantity: i.quantity, price: hatPrice(i.hat_id) }));
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: orderItems, total, user_id: userId }),
      });
      if (!res.ok) throw new Error("Order failed");
      router.push("/orders");
    } catch (e) {
      setError(String(e));
      setPlacing(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading cart…</p>;

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (!token) return (
    <div className="text-center py-16">
      <p className="text-gray-500 mb-4">Please log in to view your cart.</p>
      <a href="/login" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Sign in</a>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-bold mb-8">Your Cart</h1>
      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">🛒</p>
          <p>Your cart is empty.</p>
          <a href="/catalogue" className="mt-4 inline-block text-sm underline">Browse hats</a>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
          {items.map(item => (
            <div key={item.id} className="flex justify-between items-center px-5 py-4">
              <div>
                <p className="font-medium flex items-center gap-1.5">
                <HatLogo className="w-4 h-3 shrink-0" />
                {hatName(item.hat_id)}
              </p>
                <p className="text-sm text-gray-400">qty: {item.quantity}</p>
              </div>
              <p className="font-semibold">${(hatPrice(item.hat_id) * item.quantity).toFixed(2)}</p>
            </div>
          ))}
          <div className="flex justify-between items-center px-5 py-4 font-bold text-lg">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          {error && <p className="px-5 py-2 text-red-600 text-sm">{error}</p>}
          <div className="px-5 py-4">
            <button
              onClick={placeOrder} disabled={placing}
              className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50"
            >
              {placing ? "Placing order…" : "Place Order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
