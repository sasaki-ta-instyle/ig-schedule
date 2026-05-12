export const dynamic = "force-dynamic";

export async function GET() {
  // この行に到達した時点で Nginx の Basic Auth を通過済み
  return Response.json({ ok: true });
}
