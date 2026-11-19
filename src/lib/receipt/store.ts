import "server-only";
import sharp from "sharp";
import { query } from "@/lib/db";
import { ensureMigrated } from "@/db/init";
import { receiptSettingsSchema, withDefaults, type ReceiptSettings, dotsFor, type PaperWidth } from "./settings";

/** Configuração dos recibos guardada na base de dados (uma linha por estabelecimento). */
export type StoredReceiptSettings = { settings: ReceiptSettings; logoVersion: number; hasLogo: boolean; updatedAt: string; updatedBy: string | null };

export async function getReceiptSettings(): Promise<StoredReceiptSettings> {
  await ensureMigrated();
  const r = await query<{ settings: unknown; logo_version: number; has_logo: boolean; updated_at: Date; updated_by: string | null }>(
    "select settings, logo_version, logo is not null has_logo, updated_at, updated_by from receipt_settings where id = 1");
  const row = r.rows[0];
  return {
    settings: withDefaults(row?.settings), logoVersion: row?.logo_version ?? 0, hasLogo: !!row?.has_logo,
    updatedAt: (row?.updated_at ?? new Date()).toISOString(), updatedBy: row?.updated_by ?? null,
  };
}

export type SaveResult = { ok: true; settings: ReceiptSettings } | { ok: false; error: string };

/** Valida tudo no servidor (o navegador pode mandar o que quiser). */
export async function saveReceiptSettings(input: unknown, actor: string): Promise<SaveResult> {
  const p = receiptSettingsSchema.safeParse(input);
  if (!p.success) {
    const i = p.error.issues[0];
    return { ok: false, error: `${i?.message ?? "Configuração inválida."}${i?.path?.length ? ` (${i.path.join(" › ")})` : ""}` };
  }
  if (p.data.footer.qr && !p.data.footer.qrUrl) return { ok: false, error: "Para mostrar o QR Code indique o endereço da loja online." };
  await ensureMigrated();
  await query("update receipt_settings set settings = $1, updated_at = now(), updated_by = $2 where id = 1", [JSON.stringify(p.data), actor]);
  return { ok: true, settings: p.data };
}

/** Logótipo: confirmado como imagem, sem metadados, fundo branco, PNG em tons de cinzento até 576 px (largura de 80 mm). */
export async function saveLogo(input: Buffer): Promise<{ ok: true } | { ok: false; error: string }> {
  let png: Buffer;
  try {
    png = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate().flatten({ background: "#ffffff" }).resize({ width: 576, height: 400, fit: "inside", withoutEnlargement: true })
      .grayscale().toColourspace("b-w").png({ compressionLevel: 9 }).toBuffer();
  } catch {
    return { ok: false, error: "Não foi possível ler a imagem. Use PNG ou JPG." };
  }
  await ensureMigrated();
  await query("update receipt_settings set logo = $1, logo_type = 'image/png', logo_version = logo_version + 1, updated_at = now() where id = 1", [png]);
  rasterCache.clear();
  return { ok: true };
}

export async function removeLogo() {
  await ensureMigrated();
  await query("update receipt_settings set logo = null, logo_type = null, logo_version = logo_version + 1, updated_at = now() where id = 1");
  rasterCache.clear();
}

export async function getLogo(): Promise<{ png: Buffer; version: number } | null> {
  await ensureMigrated();
  const r = await query<{ logo: Buffer | null; logo_version: number }>("select logo, logo_version from receipt_settings where id = 1");
  return r.rows[0]?.logo ? { png: r.rows[0].logo, version: r.rows[0].logo_version } : null;
}

/** Servidor do restaurante: aplica a configuração recebida do central (o logótipo vem à parte, só quando muda). */
export async function applySyncedReceiptSettings(settings: unknown): Promise<void> {
  await query("update receipt_settings set settings = $1, updated_at = now(), updated_by = 'servidor-central' where id = 1", [JSON.stringify(withDefaults(settings))]);
}
export async function saveSyncedLogo(png: Buffer | null, version: number) {
  await query("update receipt_settings set logo = $1, logo_type = $2, logo_version = $3 where id = 1", [png, png ? "image/png" : null, version]);
  rasterCache.clear();
}

// ---------- logótipo para a impressora térmica (imagem de 1 bit, com pontilhado) ----------
export type Raster = { width: number; height: number; data: Buffer }; // 1 bit por ponto, linhas de ceil(width/8) bytes, 1 = preto
const rasterCache = new Map<string, Raster>();

export async function logoRaster(paper: PaperWidth): Promise<Raster | null> {
  const logo = await getLogo();
  if (!logo) return null;
  const key = `${logo.version}:${paper}`;
  const hit = rasterCache.get(key);
  if (hit) return hit;
  const maxW = Math.round(dotsFor(paper) * 0.6); // logótipo a ~60 % da largura
  const { data, info } = await sharp(logo.png).resize({ width: maxW, height: 200, fit: "inside", withoutEnlargement: true })
    .grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  // Floyd–Steinberg: tons de cinzento → preto/branco sem perder o desenho
  const px = Float32Array.from(data);
  const bytesPerRow = Math.ceil(w / 8);
  const out = Buffer.alloc(bytesPerRow * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, old = px[i], nw = old < 128 ? 0 : 255, err = old - nw;
    if (nw === 0) out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    if (x + 1 < w) px[i + 1] += (err * 7) / 16;
    if (y + 1 < h) { if (x > 0) px[i + w - 1] += (err * 3) / 16; px[i + w] += (err * 5) / 16; if (x + 1 < w) px[i + w + 1] += err / 16; }
  }
  const r = { width: w, height: h, data: out };
  rasterCache.set(key, r);
  return r;
}
