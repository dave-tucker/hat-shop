"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface CartItem { id: string; hat_id: string; quantity: number; }

interface CartCtx {
  items: CartItem[];
  totalItems: number;
  qtyFor: (hatId: string) => number;
  addItem: (hatId: string, qty: number, token: string, userId: string) => Promise<boolean>;
  refresh: () => void;
}

const Ctx = createContext<CartCtx>({
  items: [],
  totalItems: 0,
  qtyFor: () => 0,
  addItem: async () => false,
  refresh: () => {},
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const load = useCallback(async () => {
    if (typeof window === "undefined") return;
    const token  = localStorage.getItem("token");
    const userId = localStorage.getItem("user_id");
    if (!token || !userId) { setItems([]); return; }

    const res = await fetch(`/api/cart?userId=${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setItems(data.items ?? []);
  }, []);

  // Load on mount and whenever auth changes
  useEffect(() => {
    load();
    const onCart = () => load();
    window.addEventListener("cartUpdated", onCart);
    window.addEventListener("authChanged",  onCart);
    return () => {
      window.removeEventListener("cartUpdated", onCart);
      window.removeEventListener("authChanged",  onCart);
    };
  }, [load]);

  const addItem = useCallback(async (
    hatId: string, qty: number, token: string, userId: string,
  ): Promise<boolean> => {
    const res = await fetch(`/api/cart/items?userId=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hat_id: hatId, quantity: qty }),
    }).catch(() => null);
    if (res?.ok) {
      await load();
      window.dispatchEvent(new Event("cartUpdated"));
    }
    return res?.ok ?? false;
  }, [load]);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const qtyFor = (hatId: string) => items.find(i => i.hat_id === hatId)?.quantity ?? 0;

  return (
    <Ctx.Provider value={{ items, totalItems, qtyFor, addItem, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() { return useContext(Ctx); }
