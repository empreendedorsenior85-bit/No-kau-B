import { submitOrder } from "@/lib/submit-order";
import { getCustomer } from "@/lib/customers";

export const maxDuration = 30;

/**
 * Envio do pedido pelo cliente (QR Code). Rota estável: continua a funcionar para páginas
 * abertas antes de uma nova publicação do site (as ações de servidor mudam de id a cada publicação).
 */
export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 50_000) return Response.json({ ok: false, message: "Pedido demasiado grande." }, { status: 413 });
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return Response.json({ ok: false, message: "Pedido inválido." }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  // cliente com sessão iniciada: o pedido fica no histórico dele (identidade lida da sessão, nunca do corpo do pedido)
  const customer = await getCustomer().catch(() => null);
  const { status, body } = await submitOrder(input, ip, customer?.id ?? null);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
