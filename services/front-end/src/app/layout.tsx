import type { Metadata } from "next";
import "./globals.css";
import { ClusterBadge } from "@/components/ClusterBadge";
import { HatLogo } from "@/components/HatLogo";
import { CartBadge } from "@/components/CartBadge";
import { TokenBalance } from "@/components/TokenBalance";
import { UserNav } from "@/components/UserNav";
import { CartProvider } from "@/lib/cart-context";

export const metadata: Metadata = {
  title: "Hat Shop — Plexus Multi-Cluster Demo",
  description: "A multi-cluster microservices demo powered by Plexus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <CartProvider>
          <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
              <a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <HatLogo className="w-7 h-7" />
                Hat Shop
              </a>
              <div className="flex items-center gap-5">
                <ClusterBadge />
                <nav className="flex items-center gap-5 text-sm">
                  <a href="/catalogue" className="hover:underline">Catalogue</a>
                  <CartBadge />
                  <a href="/orders" className="hover:underline">Orders</a>
                  <TokenBalance />
                  <UserNav />
                </nav>
              </div>
            </div>
          </header>
          <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
          <footer className="border-t border-gray-200 mt-16 py-6 text-center text-xs text-gray-400">
            Hat Shop — Multi-cluster demo powered by{" "}
            <a href="https://github.com/ovn-kubernetes" className="underline">Plexus / OVN-Kubernetes</a>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
