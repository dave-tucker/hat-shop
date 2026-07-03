"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode]       = useState<"login" | "register">("login");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        if (!res.ok) throw new Error(await res.text());
        setMode("login");
        setError("Registered! Please log in.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error("Invalid credentials");
      const { token, user_id } = await res.json();
      localStorage.setItem("token", token);
      localStorage.setItem("user_id", user_id);
      window.dispatchEvent(new Event("authChanged"));
      router.push("/catalogue");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6 text-center">
        {mode === "login" ? "Sign In" : "Create Account"}
      </h1>
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        {mode === "register" && (
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Ada Lovelace" required
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="ada@example.com" required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="••••••••" required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="w-full text-sm text-gray-500 hover:underline"
        >
          {mode === "login" ? "No account? Register" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
