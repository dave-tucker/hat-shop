"use client";

import { useCart } from "@/lib/cart-context";

export function CartBadge() {
  const { totalItems } = useCart();

  return (
    <a href="/cart" className="relative inline-flex items-center gap-1.5 hover:opacity-70 transition">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        className="w-6 h-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>
      <span className="hidden sm:inline text-sm font-medium">Cart</span>
      {totalItems > 0 && (
        <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center
          rounded-full bg-gray-900 text-white text-[10px] font-bold leading-none">
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      )}
    </a>
  );
}
