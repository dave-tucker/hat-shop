import { NextRequest, NextResponse } from "next/server";

const CARTS_URL = process.env.CARTS_URL ?? "http://carts:8080";

// GET /api/cart?userId=xxx  — fetch cart
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const auth = req.headers.get("authorization") ?? "";
  const res  = await fetch(`${CARTS_URL}/carts/${userId}`, { headers: { Authorization: auth } });
  return NextResponse.json(await res.json(), { status: res.status });
}

// DELETE /api/cart?userId=xxx  — clear cart
export async function DELETE(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const auth = req.headers.get("authorization") ?? "";
  await fetch(`${CARTS_URL}/carts/${userId}`, { method: "DELETE", headers: { Authorization: auth } });
  return new NextResponse(null, { status: 204 });
}
