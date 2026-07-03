"use client";

import { useEffect, useState } from "react";

export function TokenBalance() {
  const [tokens, setTokens] = useState<number | null>(null);

  useEffect(() => {
    function load() {
      const token  = localStorage.getItem("token");
      const userId = localStorage.getItem("user_id");
      if (!token || !userId) { setTokens(null); return; }

      fetch(`/api/tokens?userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setTokens(d.tokens))
        .catch(() => {});
    }

    load();
    window.addEventListener("authChanged",  load);
    window.addEventListener("cartUpdated",  load); // tokens change after checkout
    return () => {
      window.removeEventListener("authChanged", load);
      window.removeEventListener("cartUpdated", load);
    };
  }, []);

  if (tokens === null) return null;

  return (
    <span className="text-xs font-medium text-gray-500 hidden sm:inline">
      {tokens} tokens
    </span>
  );
}
