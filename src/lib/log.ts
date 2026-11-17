/**
 * Registos estruturados (uma linha JSON por evento) — legíveis e filtráveis nos registos da Vercel e no servidor local
 * (ex.: `grep '"level":"error"'`). Nunca registar palavras-passe, tokens, cookies nem dados pessoais completos.
 */
type Level = "info" | "warn" | "error";
type Data = Record<string, unknown>;

const role = () => (process.env.NOKAU_ROLE === "local" ? "local" : "central");

function write(level: Level, event: string, data?: Data) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, node: role(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Erro → só nome, mensagem e as primeiras linhas da pilha (sem dados do pedido). */
export const errInfo = (e: unknown) =>
  e instanceof Error ? { error: e.message, kind: e.name, code: (e as { code?: string }).code, stack: e.stack?.split("\n").slice(1, 4).join(" | ") } : { error: String(e) };

export const log = {
  info: (event: string, data?: Data) => write("info", event, data),
  warn: (event: string, data?: Data) => write("warn", event, data),
  error: (event: string, data?: Data) => write("error", event, data),
};
