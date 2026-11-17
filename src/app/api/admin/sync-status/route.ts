import { getManager } from "@/lib/auth";
import { isLocalServer, syncToken } from "@/lib/node-role";
import { getSyncState } from "@/lib/sync/orders-sync";

export type SyncStatusView =
  | { role: "local"; online: boolean; lastOkAt: string | null; lastError: string | null; pending: number; rejected: number }
  | { role: "central"; configured: boolean; peer: { lastSeenAt: string; pending: number | null } | null };

/** Estado da sincronização para o painel (servidor local ↔ central). */
export async function GET() {
  if (!(await getManager())) return new Response("unauthorized", { status: 401 });
  if (isLocalServer()) {
    const { localSyncStatus } = await import("@/lib/sync/worker");
    const s = localSyncStatus();
    const body: SyncStatusView = { role: "local", online: s.online, lastOkAt: s.lastOkAt, lastError: s.lastError, pending: s.pending, rejected: s.rejected.length };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  }
  const peer = syncToken() ? await getSyncState<{ lastSeenAt: string; pending: number | null }>("peer:local").catch(() => null) : null;
  const body: SyncStatusView = { role: "central", configured: !!syncToken(), peer };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

/** "Sincronizar agora" (só no servidor local). */
export async function POST() {
  if (!(await getManager())) return new Response("unauthorized", { status: 401 });
  if (!isLocalServer()) return new Response("not found", { status: 404 });
  const { syncOnce } = await import("@/lib/sync/worker");
  const s = await syncOnce();
  return Response.json({ online: s.online, pending: s.pending, lastError: s.lastError });
}
