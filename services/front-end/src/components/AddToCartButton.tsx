"use client";

import { useState } from "react";

interface Props {
  hatId: string;
  hatName: string;
  price: number;
}

export function AddToCartButton({ hatId, hatName }: Props) {
  const [status, setStatus] = useState<"idle" | "added" | "error" | "no-auth">("idle");

  async function handleAdd() {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("user_id");
    if (!token || !userId) { setStatus("no-auth"); return; }

    const res = await fetch(`/api/cart/items?userId=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hat_id: hatId, quantity: 1 }),
    });
    setStatus(res.ok ? "added" : "error");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <button
      onClick={handleAdd}
      className={`w-full py-2 rounded-lg text-sm font-medium transition ${
        status === "added"   ? "bg-green-500 text-white" :
        status === "error"   ? "bg-red-500 text-white" :
        status === "no-auth" ? "bg-yellow-400 text-yellow-900" :
        "bg-gray-900 text-white hover:bg-gray-700"
      }`}
    >
      {status === "added"   ? "✓ Added!" :
       status === "error"   ? "Error" :
       status === "no-auth" ? "Login to add to cart" :
       `Add to Cart — ${hatName}`}
    </button>
  );
}
