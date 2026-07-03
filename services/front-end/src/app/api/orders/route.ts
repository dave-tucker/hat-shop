import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ordersUrl = process.env.ORDERS_URL ?? "http://localhost:8082";
  const auth = req.headers.get("authorization") ?? "";
  const res = await fetch(`${ordersUrl}/orders`, {
    headers: { Authorization: auth },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const ordersUrl  = process.env.ORDERS_URL   ?? "http://localhost:8082";
  const paymentsUrl = process.env.PAYMENTS_URL ?? "http://localhost:8084";
  const cartsUrl   = process.env.CARTS_URL    ?? "http://localhost:8083";
  const auth = req.headers.get("authorization") ?? "";
  const body = await req.json();

  // Create order
  const orderRes = await fetch(`${ordersUrl}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ items: body.items }),
  });
  if (!orderRes.ok) return NextResponse.json({ error: "order failed" }, { status: 500 });
  const { id: orderId } = await orderRes.json();

  // Process payment
  await fetch(`${paymentsUrl}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ order_id: orderId, amount: body.total }),
  });

  // Clear cart
  if (body.user_id) {
    await fetch(`${cartsUrl}/carts/${body.user_id}`, {
      method: "DELETE",
      headers: { Authorization: auth },
    }).catch(() => {});
  }

  return NextResponse.json({ id: orderId }, { status: 201 });
}
