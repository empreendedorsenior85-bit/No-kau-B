import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireManager } from "@/lib/auth";
import { query } from "@/lib/db";
import { originFrom } from "@/lib/origin";
import { PrintButton } from "@/components/admin/TableActions";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = { title: "Imprimir QR Codes" };

export default async function Page() {
  await requireManager();
  const origin = originFrom(await headers());
  const r = await query<{ id: number; number: number; label: string; qr_token: string }>(
    "select id, number, label, qr_token from dining_tables where active order by number");
  const tables = await Promise.all(
    r.rows.map(async (t) => ({ ...t, svg: await QRCode.toString(`${origin}/m/${t.qr_token}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) })),
  );
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-mist">Uma ficha por mesa, pronta a imprimir (use “Guardar como PDF” para um ficheiro).</p>
        <PrintButton />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-4">
        {tables.map((t) => (
          <section key={t.id} className="break-inside-avoid rounded-[1.5rem] border border-kau-950/20 bg-white p-8 text-center text-kau-950 print:border-black/40">
            <Logo size={72} className="mx-auto h-16 w-16" />
            <h2 className="mt-3 font-display text-4xl">{t.label}</h2>
            <div className="mx-auto mt-4 w-56 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: t.svg }} role="img" aria-label={`QR Code da ${t.label}`} />
            <p className="mt-4 font-display text-lg">Aponte a câmara do telemóvel</p>
            <p className="text-sm">para ver o menu e fazer o seu pedido</p>
          </section>
        ))}
      </div>
    </>
  );
}
