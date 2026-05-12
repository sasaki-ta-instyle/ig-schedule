import crypto from "node:crypto";

const COOKIE = "ig_edit";

function getPassword(): string {
  return process.env.EDIT_MODE_PASSWORD ?? "";
}

function token(): string {
  const pw = getPassword();
  if (!pw) return "";
  return crypto.createHmac("sha256", pw).update("ig-schedule-edit-v1").digest("hex");
}

export function isAuthEnabled(): boolean {
  return Boolean(getPassword());
}

export function expectedToken(): string {
  return token();
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

export function isAuthorized(req: Request): boolean {
  if (!isAuthEnabled()) return true;
  const t = readCookie(req, COOKIE);
  if (!t) return false;
  const expected = expectedToken();
  if (t.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(t, "utf8"),
    Buffer.from(expected, "utf8"),
  );
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

export const COOKIE_NAME = COOKIE;
