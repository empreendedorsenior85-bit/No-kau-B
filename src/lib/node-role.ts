/**
 * Papel desta instalação.
 *  - central (por defeito): o site na internet (Vercel + Neon). Fonte do menu, das mesas e dos utilizadores.
 *  - local (NOKAU_ROLE=local): servidor no computador do restaurante, na rede Wi-Fi. Funciona sem internet;
 *    recebe o catálogo do central e troca pedidos com ele quando há ligação.
 * Sem imports de servidor: o valor é lido de variáveis de ambiente.
 */
export const isLocalServer = () => process.env.NOKAU_ROLE === "local";

/** Endereço do servidor central (só no servidor local). */
export const centralUrl = () => (process.env.NOKAU_CENTRAL_URL ?? "").replace(/\/$/, "");

/** Segredo partilhado entre o servidor local e o central (mínimo 32 caracteres). */
export function syncToken(): string | null {
  const t = process.env.NOKAU_SYNC_TOKEN ?? "";
  return t.length >= 32 ? t : null;
}
