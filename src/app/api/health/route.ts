import { query, dbConfigured } from "@/lib/db";
import { ensureMigrated } from "@/db/init";
import { log, errInfo } from "@/lib/log";

/**
 * Estado do serviço para monitorização (ex.: UptimeRobot, Better Stack, a cada 1–5 min).
 * 200 = tudo bem; 503 = base de dados indisponível. Não revela dados nem configuração sensível.
 */
export async function GET() {
  const started = Date.now();
  const role = process.env.NOKAU_ROLE === "local" ? "local" : "central";
  const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NOKAU_VERSION ?? "dev").slice(0, 7);
  const headers = { "Cache-Control": "no-store" };
  if (!dbConfigured()) return Response.json({ ok: false, role, version, db: "not_configured" }, { status: 503, headers });
  try {
    await query("select 1");
    const dbMs = Date.now() - started;
    await ensureMigrated();
    return Response.json({ ok: true, role, version, db: "ok", dbMs, time: new Date().toISOString() }, { headers });
  } catch (e) {
    log.error("health.db_failed", errInfo(e));
    return Response.json({ ok: false, role, version, db: "error" }, { status: 503, headers });
  }
}
