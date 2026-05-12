import { NextResponse } from "next/server";
import {
  authCookieHeader,
  expectedToken,
  isAuthEnabled,
  isAuthorized,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AGE = 60 * 60 * 24 * 30; // 30日

export async function GET(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, authEnabled: false });
  }
  const ok = isAuthorized(req);
  return NextResponse.json(
    { ok, authEnabled: true },
    { status: ok ? 200 : 401 },
  );
}

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, authEnabled: false });
  }
  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {}
  if (!verifyPassword(body.password)) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": authCookieHeader(expectedToken(), MAX_AGE),
    },
  });
}

export async function DELETE() {
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": authCookieHeader("", 0),
    },
  });
}
