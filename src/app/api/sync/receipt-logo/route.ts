import { authorizeSync } from "@/lib/sync/auth";
import { getLogo } from "@/lib/receipt/store";
import { query } from "@/lib/db";

/** Logótipo dos recibos para o servidor do restaurante (204 = sem logótipo). */
export async function GET(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  const logo = await getLogo();
  if (!logo) {
    const v = await query<{ logo_version: number }>("select logo_version from receipt_settings where id = 1");
    return new Response(null, { status: 204, headers: { "X-Logo-Version": String(v.rows[0]?.logo_version ?? 0) } });
  }
  return new Response(new Uint8Array(logo.png), { headers: { "Content-Type": "image/png", "X-Logo-Version": String(logo.version), "Cache-Control": "no-store" } });
}
