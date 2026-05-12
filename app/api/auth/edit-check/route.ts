import { NextResponse } from "next/server";
import {
  authCookieHeader,
  COOKIE_NAME,
  createSession,
  deleteSession,
  isAuthEnabled,
  isAuthorizedAsync,
  MAX_AGE_SEC,
  readCookie,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, authEnabled: false });
  }
  const ok = await isAuthorizedAsync(req);
  return NextResponse.json(
    { ok, authEnabled: true },
    { status: ok ? 200 : 401 },
  );
}

export async function POST(req: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ ok: true, authEnabled: false });
  }
  let body: { password?: unknown } = {};
  try {
    body = await req.json();
  } catch {}
  if (!verifyPassword(body.password)) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }
  // ラベルとして UA の短縮版を保存しておく（後から admin で見分けやすく）
  const ua = req.headers.get("user-agent") ?? "";
  const sessionId = await createSession(ua.slice(0, 120) || null);
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": authCookieHeader(sessionId, MAX_AGE_SEC),
    },
  });
}

export async function DELETE(req: Request) {
  const sid = readCookie(req, COOKIE_NAME);
  if (sid) {
    try {
      await deleteSession(sid);
    } catch {}
  }
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": authCookieHeader("", 0),
    },
  });
}
