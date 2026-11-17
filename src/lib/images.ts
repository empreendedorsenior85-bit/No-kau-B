import "server-only";
import sharp from "sharp";

/**
 * Fotos dos produtos: tudo o que entra é normalizado no servidor.
 *  - confirma que é mesmo uma imagem (um ficheiro disfarçado é recusado);
 *  - endireita pela orientação da câmara e remove os metadados (EXIF: localização GPS, modelo do telemóvel…);
 *  - reduz para 800 px de largura no máximo (o menu mostra-as a ~360–420 px; chega para ecrãs de alta densidade);
 *  - grava em WebP (≈ 30–60 kB por foto em vez de 0,5–1 MB) — o menu abre depressa mesmo em 3G.
 */
export const MENU_IMAGE_MAX_UPLOAD = 950_000; // o painel já reduz a foto no telemóvel (≤ 900 KB); o pedido tem limite de 1 MB
const WIDTH = 800;
const QUALITY = 70;

export async function normalizeMenuImage(input: Buffer): Promise<{ buf: Buffer; type: "image/webp" } | null> {
  try {
    const out = await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" })
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 4 })
      .toBuffer();
    return { buf: out, type: "image/webp" };
  } catch {
    return null;
  }
}

/** Uma foto guardada antes desta regra (formato original, grande) precisa de ser normalizada? */
export const needsNormalize = (type: string | null, bytes: number) => type !== "image/webp" || bytes > 150_000;
