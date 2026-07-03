import { getCatalogue } from "@/lib/api";
import { AddToCartButton } from "@/components/AddToCartButton";

export const dynamic = "force-dynamic";

export default async function CataloguePage() {
  const hats = await getCatalogue();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Hat Catalogue</h1>
      {hats.length === 0 && (
        <p className="text-gray-500">No hats available — is the catalogue service running?</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {hats.map((hat) => (
          <div key={hat.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
            <div className="text-5xl text-center py-4">🎩</div>
            <div>
              <h2 className="font-semibold text-lg">{hat.name}</h2>
              <p className="text-sm text-gray-500 mt-1">{hat.description}</p>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span className="text-xl font-bold">${hat.price.toFixed(2)}</span>
              <span className="text-xs text-gray-400">{hat.stock} in stock</span>
            </div>
            <AddToCartButton hatId={hat.id} hatName={hat.name} price={hat.price} />
          </div>
        ))}
      </div>
    </div>
  );
}
