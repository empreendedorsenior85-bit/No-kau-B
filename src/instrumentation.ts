/** Arranque do servidor. No servidor local do restaurante (NOKAU_ROLE=local) inicia a sincronização com o central. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NOKAU_ROLE === "local") {
    const { startSyncWorker } = await import("./lib/sync/worker");
    startSyncWorker();
  }
}
