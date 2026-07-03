import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.CATALOGUE_URL ?? "http://localhost:8081";
  const res = await fetch(`${url}/catalogue`, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
