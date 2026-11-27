import { query } from "@/lib/db";
import { recordFailure } from "@/lib/menu-images";

/**
 * Aviso do navegador: uma imagem do menu não carregou. Público (é o telemóvel do cliente que avisa),
 * por isso: só aceita produtos que existem, o caminho tem de ser de imagem do menu, uma falha por produto
 * por hora, e no máximo 200 avisos por hora no total. Responde sempre 204 (não revela nada).
 */
export async function POST(req: Request) {
  const done = new Response(null, { status: 204 });
  try {
    const body = (await req.json().catch(() => null)) as { itemId?: unknown; src?: unknown } | null;
    const id = Number(body?.itemId), src = String(body?.src ?? "").slice(0, 300);
    if (!Number.isInteger(id) || id <= 0) return done;
    let path = src; try { path = new URL(src, "http://x").pathname; } catch {}
    if (!/^\/(api\/menu-image\/\d+|menu\/ilustrativas\/[\w\-/]+\.(webp|jpe?g|png))$/.test(path)) return done;
    const ok = await query("select 1 from menu_items where id = $1 and active", [id]);
    if (!ok.rows[0]) return done;
    const n = await query<{ n: string }>("select count(*) n from image_failures where created_at > now() - interval '1 hour'");
    if (Number(n.rows[0].n) >= 200) return done;
    await recordFailure(id, path, "client_load", (req.headers.get("user-agent") ?? "").slice(0, 160));
  } catch {}
  return done;
}
