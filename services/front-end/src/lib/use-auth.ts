"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Auth {
  token: string;
  userId: string;
}

/**
 * Returns auth credentials once confirmed from localStorage.
 * Redirects to /login if unauthenticated — never flashes protected content.
 * Returns null during the initial SSR pass (window not yet available).
 */
export function useAuth(redirectTo = "/login"): Auth | null {
  const router  = useRouter();
  const [auth, setAuth] = useState<Auth | null>(null);

  useEffect(() => {
    const token  = localStorage.getItem("token");
    const userId = localStorage.getItem("user_id");
    if (!token || !userId) {
      const from = encodeURIComponent(window.location.pathname);
      router.replace(`${redirectTo}?from=${from}`);
    } else {
      setAuth({ token, userId });
    }
  }, [router, redirectTo]);

  return auth;
}
