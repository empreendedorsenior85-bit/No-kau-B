/**
 * Arranque do servidor.
 *  - Servidor local do restaurante (NOKAU_ROLE=local): sincronização com o central + agente de impressão.
 *  - NOKAU_PRINT_AGENT=1: só o agente de impressão (instalação sem servidor local completo).
 * No site central (Vercel) nada disto corre: a internet não alcança as impressoras do restaurante.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NOKAU_ROLE === "local") {
    const { startSyncWorker } = await import("./lib/sync/worker");
    startSyncWorker();
  }
  if (process.env.NOKAU_ROLE === "local" || process.env.NOKAU_PRINT_AGENT === "1") {
    const { startPrintAgent } = await import("./lib/print/agent");
    startPrintAgent();
  }
}
