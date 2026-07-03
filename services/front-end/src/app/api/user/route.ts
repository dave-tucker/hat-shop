import { NextRequest, NextResponse } from "next/server";

// GET /api/user?id=xxx
export async function GET(req: NextRequest) {
  const userUrl = process.env.USER_URL ?? "http://user:8080";
  const auth    = req.headers.get("authorization") ?? "";
  const id      = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const res  = await fetch(`${userUrl}/users/${id}`, { headers: { Authorization: auth } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
