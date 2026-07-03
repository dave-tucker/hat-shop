import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    CARTS_URL: process.env.CARTS_URL,
    USER_URL:  process.env.USER_URL,
    CLUSTER:   process.env['CLUSTER_NAME'],
    NODE_ENV:  process.env['NODE_ENV'],
  });
}
