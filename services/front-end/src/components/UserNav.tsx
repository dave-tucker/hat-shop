"use client";

import { useEffect, useState } from "react";

export function UserNav() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    function sync() {
      const token = localStorage.getItem("token");
      setName(token ? (localStorage.getItem("user_name") || "Account") : null);
    }
    sync();
    window.addEventListener("authChanged", sync);
    return () => window.removeEventListener("authChanged", sync);
  }, []);

  if (name === null) {
    return <a href="/login" className="hover:underline text-sm">Login</a>;
  }

  return (
    <a href="/profile" className="flex items-center gap-1.5 hover:opacity-70 transition" title={name}>
      {/* User icon */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
        className="w-5 h-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
      <span className="text-sm hidden sm:inline max-w-[80px] truncate">{name}</span>
    </a>
  );
}
