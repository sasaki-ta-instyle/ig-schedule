import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthEnabled, isAuthorized } from "@/lib/auth";

export function middleware(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return NextResponse.next();
  }
  // 認証エンドポイント自体は通す（POST でクッキーを発行するため）
  const path = req.nextUrl.pathname;
  if (
    path === "/api/auth/edit-check" ||
    path.endsWith("/api/auth/edit-check")
  ) {
    return NextResponse.next();
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
  runtime: "nodejs",
};
