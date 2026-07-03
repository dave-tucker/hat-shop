import { notFound } from "next/navigation";
import { AddToCartControls } from "@/components/AddToCartControls";
import { HatImage } from "@/components/HatImage";
import type { Hat } from "@/lib/api";

export const dynamic = "force-dynamic";

async function getHat(id: string): Promise<Hat | null> {
  const url = process.env.CATALOGUE_URL ?? "http://catalogue:8080";
  const res = await fetch(`${url}/catalogue/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const hat = await getHat(params.id);
  if (!hat) notFound();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 mb-6">
        <a href="/catalogue" className="hover:underline">Catalogue</a>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{hat.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Full product image — uncropped, object-contain */}
        <div className="bg-gray-50 flex items-center justify-center min-h-80">
          <HatImage
            src={hat.image_url}
            alt={hat.name}
            className="w-full h-full max-h-[480px] object-contain p-6"
          />
        </div>

        {/* Product info */}
        <div className="p-8 flex flex-col gap-6">
          <div>
            <h1 className="text-3xl font-bold">{hat.name}</h1>
            <p className="text-3xl font-bold text-gray-900 mt-2">${hat.price.toFixed(2)}</p>
            <p className="text-sm text-gray-400 mt-1">{hat.stock} in stock</p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">About this hat</h2>
            <p className="text-gray-700 leading-relaxed">{hat.description}</p>
          </div>

          <div className="mt-auto pt-4 border-t border-gray-100">
            <AddToCartControls
              hatId={hat.id}
              hatName={hat.name}
              price={hat.price}
              showDetails={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
