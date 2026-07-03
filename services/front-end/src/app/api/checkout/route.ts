import { NextRequest, NextResponse } from "next/server";

const ORDERS_URL   = process.env.ORDERS_URL   ?? "http://orders:8080";
const PAYMENTS_URL = process.env.PAYMENTS_URL ?? "http://payments:8080";
const CARTS_URL    = process.env.CARTS_URL    ?? "http://carts:8080";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const body = await req.json();
  // body: { items, total, user_id, shipping_address }

  // 1. Create order (stock is checked + decremented here)
  const orderRes = await fetch(`${ORDERS_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      items:            body.items,
      shipping_address: body.shipping_address,
    }),
  });
  if (!orderRes.ok) {
    const err = await orderRes.json().catch(() => ({ error: "order failed" }));
    return NextResponse.json(err, { status: orderRes.status });
  }
  const { id: orderId } = await orderRes.json();

  // 2. Deduct tokens and record payment
  const payRes = await fetch(`${PAYMENTS_URL}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      order_id: orderId,
      user_id:  body.user_id,
      amount:   body.total,
    }),
  });
  if (!payRes.ok) {
    // Payment failed — cancel the order so it doesn't sit as pending forever
    await fetch(`${ORDERS_URL}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ status: "cancelled" }),
    }).catch(() => {});
    const err = await payRes.json().catch(() => ({ error: "payment failed" }));
    return NextResponse.json(err, { status: payRes.status });
  }

  // 3. Clear cart
  if (body.user_id) {
    await fetch(`${CARTS_URL}/carts/${body.user_id}`, {
      method: "DELETE",
      headers: { Authorization: auth },
    }).catch(() => {});
  }

  const payment = await payRes.json();
  return NextResponse.json({ order_id: orderId, tokens_spent: payment.tokens }, { status: 201 });
}
