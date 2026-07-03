import { NextRequest, NextResponse } from "next/server";

const ORDERS_URL   = process.env.ORDERS_URL   ?? "http://orders:8080";
const PAYMENTS_URL = process.env.PAYMENTS_URL ?? "http://payments:8080";
const SHIPPING_URL = process.env.SHIPPING_URL ?? "http://shipping:8080";

// GET /api/order?id=xxx  — aggregates order + payment + shipment for timeline
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const id   = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Fetch order with items (requires auth)
  const orderRes = await fetch(`${ORDERS_URL}/orders/${id}`, {
    headers: { Authorization: auth },
  });
  if (!orderRes.ok) return NextResponse.json({ error: "not found" }, { status: orderRes.status });
  const order = await orderRes.json();

  // Fetch payment timestamp (requires auth, non-fatal)
  const payment = await fetch(`${PAYMENTS_URL}/payments/${id}`, {
    headers: { Authorization: auth },
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  // Fetch shipment status + timestamp (no auth required on shipping service)
  const shipment = await fetch(`${SHIPPING_URL}/shipping/${id}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);

  return NextResponse.json({
    ...order,
    timeline: {
      placed_at:  order.created_at,
      paid_at:    payment?.created_at ?? null,
      shipped_at: shipment?.updated_at ?? null,
      address:    shipment?.address ?? order.shipping_address,
    },
  });
}
