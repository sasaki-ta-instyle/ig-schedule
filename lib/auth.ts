import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db/client";

const COOKIE = "ig_edit";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30日

function getPassword(): string {
  return process.env.EDIT_MODE_PASSWORD ?? "";
}

export function isAuthEnabled(): boolean {
  return Boolean(getPassword());
}

export function verifyPassword(plain: unknown): boolean {
  const pw = getPassword();
  if (!pw || typeof plain !== "string") return false;
  const a = Buffer.from(plain, "utf8");
  const b = Buffer.from(pw, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function newSessionId(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(label?: string | null): Promise<string> {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + MAX_AGE_SEC * 1000);
  await db.insert(schema.sessions).values({
    id,
    expiresAt,
    label: label ?? null,
  });
  return id;
}

export async function deleteSession(id: string): Promise<void> {
  if (!id) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
}

export async function touchSessionIfValid(id: string): Promise<boolean> {
  if (!id) return false;
  // 期限内のセッションだけ有効
  const [row] = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.id, id),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return false;
  // last_seen を更新（ベストエフォート）
  try {
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.sessions.id, id));
  } catch {}
  return true;
}

export async function isAuthorizedAsync(req: Request): Promise<boolean> {
  if (!isAuthEnabled()) return true;
  const sid = readCookie(req, COOKIE);
  if (!sid) return false;
  return touchSessionIfValid(sid);
}

export function authCookieHeader(value: string, maxAgeSec: number): string {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    `Path=/`,
    `Max-Age=${maxAgeSec}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export { COOKIE as COOKIE_NAME, MAX_AGE_SEC };
