import { getLogo } from "@/lib/receipt/store";

/** Logótipo dos recibos (público: aparece nos recibos do cliente). `?v=` muda quando o logótipo é substituído. */
export async function GET() {
  const logo = await getLogo().catch(() => null);
  if (!logo) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(logo.png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
