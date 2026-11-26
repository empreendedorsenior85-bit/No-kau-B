import { getCustomer } from "@/lib/customers";

/**
 * Dados do PRÓPRIO cliente com sessão (nome, telefone, email) — para pré-preencher formulários do site público
 * (ex.: reservas), que são páginas estáticas. Sem sessão válida: 401. Nunca em cache. Sem CORS: outros sites
 * não conseguem ler a resposta.
 */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const c = await getCustomer();
  if (!c) return Response.json({ ok: false }, { status: 401, headers });
  return Response.json({ ok: true, name: c.name, phone: c.phone, email: c.email }, { headers });
}
