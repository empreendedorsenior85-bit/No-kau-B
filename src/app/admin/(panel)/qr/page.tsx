import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import { requireManager } from "@/lib/auth";
import { query } from "@/lib/db";
import { originFrom } from "@/lib/origin";
import { isLocalServer } from "@/lib/node-role";
import { AddTableButton, TableControls } from "@/components/admin/TableActions";

export const metadata: Metadata = { title: "QR Codes" };

export default async function Page() {
  const me = await requireManager();
  const canManage = me.role === "admin" && !isLocalServer(); // servidor local: mesas vêm do central // Gerente: consulta, descarrega e imprime; só o Admin altera mesas e QR Codes
  const origin = originFrom(await headers());
  const r = await query<{ id: number; number: number; label: string; qr_token: string; active: boolean }>(
    "select id, number, label, qr_token, active from dining_tables order by number");
  const tables = await Promise.all(
    r.rows.map(async (t) => ({
      ...t,
      url: `${origin}/m/${t.qr_token}`,
      svg: await QRCode.toString(`${origin}/m/${t.qr_token}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    })),
  );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-white">QR Codes das mesas</h1>
          <p className="mt-1 max-w-2xl text-sm text-mist">Cada mesa tem um QR Code exclusivo e permanente. Se um QR Code for perdido ou copiado, o Admin pode gerar um novo — o antigo deixa de funcionar.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/qr/imprimir" className="inline-flex h-11 items-center rounded-full border border-gold/60 px-5 text-sm text-gold-300 hover:bg-gold/10">🖨 Folha para imprimir</Link>
          {canManage && <AddTableButton />}
        </div>
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((t) => (
          <li key={t.id} className={`rounded-2xl border border-kau-800 bg-kau-900 p-5 ${t.active ? "" : "opacity-60"}`} data-testid={`qr-${t.number}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl text-white">{t.label}</h2>
              {!t.active && <span className="text-xs uppercase tracking-wider text-mist">Desativada</span>}
            </div>
            <div className="mx-auto mt-4 w-48 rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: t.svg }} role="img" aria-label={`QR Code da ${t.label}`} />
            <p className="mt-3 break-all text-xs text-mist" data-testid={`qr-url-${t.number}`}>{t.url}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <a className="rounded-full bg-gold px-4 py-2 text-kau-950" href={`/admin/qr-img/${t.id}?format=png&download=1`}>Descarregar PNG</a>
              <a className="rounded-full border border-gold/60 px-4 py-2 text-gold-300" href={`/admin/qr-img/${t.id}?format=svg&download=1`}>SVG</a>
              <a className="rounded-full border border-kau-800 px-4 py-2 text-mist hover:text-white" href={t.url} target="_blank" rel="noopener noreferrer">Abrir menu</a>
            </div>
            {canManage && <div className="mt-4 border-t border-kau-800 pt-4"><TableControls id={t.id} label={t.label} active={t.active} /></div>}
          </li>
        ))}
      </ul>
    </>
  );
}
