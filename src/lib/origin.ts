import "server-only";

/** Endereço público do site (para os links dos QR Codes). NEXT_PUBLIC_SITE_URL tem prioridade (domínio definitivo). */
export function originFrom(h: Headers): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
