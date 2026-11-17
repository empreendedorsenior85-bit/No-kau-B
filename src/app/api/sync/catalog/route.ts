import { authorizeSync } from "@/lib/sync/auth";
import { exportCatalog } from "@/lib/sync/catalog-sync";
import { ensureMigrated } from "@/db/init";

/** Catálogo para o servidor local (menu, mesas, utilizadores). Só com o token de sincronização. */
export async function GET(req: Request) {
  const deny = await authorizeSync(req);
  if (deny) return deny;
  await ensureMigrated();
  return Response.json(await exportCatalog(), { headers: { "Cache-Control": "no-store" } });
}
