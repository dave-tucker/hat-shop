"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HatLogo } from "@/components/HatLogo";
import { useAuth } from "@/lib/use-auth";
import { useCart } from "@/lib/cart-context";

interface CartItem { id: string; hat_id: string; quantity: number; }
interface Hat { id: string; name: string; price: number; }

export default function CartPage() {
  const router  = useRouter();
  const auth    = useAuth();          // redirects to /login if not authenticated
  const { refresh } = useCart();

  const [items, setItems]     = useState<CartItem[]>([]);
  const [hats, setHats]       = useState<Hat[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!auth) return; // wait for auth confirmation

    Promise.all([
      fetch(`/api/cart?userId=${auth.userId}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      }).then(r => r.json()),
      fetch("/api/catalogue").then(r => r.json()),
    ]).then(([cart, catalogue]) => {
      setItems(cart.items ?? []);
      setHats(catalogue ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [auth]);

  const hatName  = (id: string) => hats.find(h => h.id === id)?.name ?? id.slice(0, 8);
  const hatPrice = (id: string) => hats.find(h => h.id === id)?.price ?? 0;
  const total    = items.reduce((s, i) => s + hatPrice(i.hat_id) * i.quantity, 0);

  async function placeOrder() {
    if (!auth) return;
    setPlacing(true);
    setError("");
    try {
      const orderItems = items.map(i => ({
        hat_id: i.hat_id,
        quantity: i.quantity,
        price: hatPrice(i.hat_id),
      }));
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ items: orderItems, total, user_id: auth.userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Order failed");
      }
      refresh(); // clear cart badge
      router.push("/orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
      setPlacing(false);
    }
  }

  // auth === null means we're still waiting for the redirect — show nothing
  if (!auth || loading) {
    return <p className="text-gray-400 text-sm">Loading…</p>;
  }

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
          {error && <p className="px-5 py-3 text-red-600 text-sm bg-red-50">{error}</p>}
          <div className="px-5 py-4">
            <button
              onClick={placeOrder}
              disabled={placing}
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
