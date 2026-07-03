import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const userUrl = process.env.USER_URL ?? "http://user:8080";
  const auth    = req.headers.get("authorization") ?? "";
  const userId  = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const res = await fetch(`${userUrl}/users/${userId}/tokens`, {
    headers: { Authorization: auth },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
