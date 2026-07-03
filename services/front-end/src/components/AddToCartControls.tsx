"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-context";

interface Props {
  hatId: string;
  hatName: string;
  price: number;
  showDetails?: boolean; // show "Details" link on catalogue cards
}

export function AddToCartControls({ hatId, hatName, showDetails = true }: Props) {
  const { qtyFor, addItem } = useCart();
  const [qty, setQty]       = useState(1);
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "error" | "no-auth">("idle");

  const inCart = qtyFor(hatId);

  async function handleAdd() {
    const token  = typeof window !== "undefined" ? localStorage.getItem("token")   : null;
    const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
    if (!token || !userId) { setStatus("no-auth"); return; }

    setStatus("adding");
    const ok = await addItem(hatId, qty, token, userId);
    setStatus(ok ? "added" : "error");
    setTimeout(() => setStatus("idle"), 1800);
  }

  return (
    <div className="flex flex-col gap-2 mt-auto">
      {/* In-cart indicator */}
      {inCart > 0 && (
        <p className="text-xs text-emerald-600 font-medium text-center">
          ✓ {inCart} in cart
        </p>
      )}

      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Details link */}
        {showDetails && (
          <a
            href={`/catalogue/${hatId}`}
            className="shrink-0 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
          >
            Details
          </a>
        )}

        {/* Quantity stepper */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setQty(q => Math.max(1, q - 1))}
            className="px-2.5 py-2 text-sm hover:bg-gray-100 transition font-bold leading-none"
            aria-label="Decrease quantity"
          >−</button>
          <span className="px-2 py-2 text-sm font-medium min-w-[2rem] text-center">{qty}</span>
          <button
            onClick={() => setQty(q => Math.min(99, q + 1))}
            className="px-2.5 py-2 text-sm hover:bg-gray-100 transition font-bold leading-none"
            aria-label="Increase quantity"
          >+</button>
        </div>

        {/* Add to cart */}
        <button
          onClick={handleAdd}
          disabled={status === "adding"}
          title={`Add ${qty} × ${hatName} to cart`}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            status === "added"   ? "bg-emerald-500 text-white" :
            status === "error"   ? "bg-red-500 text-white" :
            status === "no-auth" ? "bg-yellow-400 text-yellow-900" :
            status === "adding"  ? "bg-gray-400 text-white" :
            "bg-gray-900 text-white hover:bg-gray-700"
          }`}
        >
          {status === "added"   ? "✓ Added!" :
           status === "error"   ? "Error" :
           status === "no-auth" ? "Login first" :
           status === "adding"  ? "Adding…" :
           "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
