import { NextRequest, NextResponse } from "next/server";

const CARTS_URL = process.env.CARTS_URL ?? "http://carts:8080";

// POST /api/cart/items?userId=xxx  — add item to cart
export async function POST(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const auth = req.headers.get("authorization") ?? "";
  const body = await req.json();
  const res  = await fetch(`${CARTS_URL}/carts/${userId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
  });
  return new NextResponse(null, { status: res.status });
}
