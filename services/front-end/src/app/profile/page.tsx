"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";

interface Profile { id: string; name: string; email: string; tokens: number; }

export default function ProfilePage() {
  const router  = useRouter();
  const auth    = useAuth("/login");
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!auth) return;
    fetch(`/api/user?id=${auth.userId}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setProfile(d))
      .catch(() => {});
  }, [auth]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    window.dispatchEvent(new Event("authChanged"));
    router.push("/");
  }

  if (!auth) return <p className="text-gray-400 text-sm">Loading…</p>;

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-6">My Account</h1>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y divide-gray-100">
        {/* Avatar */}
        <div className="flex items-center gap-4 px-6 py-5">
          <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"
              className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-lg">{profile?.name ?? "…"}</p>
            <p className="text-sm text-gray-400">{profile?.email ?? "…"}</p>
          </div>
        </div>

        {/* Token balance */}
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Token Balance</p>
            <p className="text-2xl font-bold mt-0.5">
              {profile?.tokens ?? "…"} tokens
            </p>
          </div>
          <a href="/catalogue"
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition">
            Browse Hats
          </a>
        </div>

        {/* Links */}
        <div className="px-6 py-4 flex flex-col gap-2">
          <a href="/orders" className="text-sm text-gray-600 hover:underline">My Orders →</a>
        </div>

        {/* Logout */}
        <div className="px-6 py-4">
          <button
            onClick={logout}
            className="w-full py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
