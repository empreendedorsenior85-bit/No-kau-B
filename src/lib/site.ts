/**
 * Dados CONFIRMADOS do restaurante. Campos `null` ainda não foram fornecidos —
 * a interface esconde-os em vez de inventar valores.
 */
export const site = {
  name: "Nô Kau",
  tagline: "Restaurante Grill · Bar & Karaoke",
  address: "Rua 7, Bissau, Guiné-Bissau",
  street: "Rua 7",
  city: "Bissau",
  country: "GW",
  plusCode: "VC59+QP Bissau",
  phoneDisplay: "+245 957 616 701",
  phoneE164: "+245957616701",
  instagram: "https://www.instagram.com/nokau.gb/",
  instagramHandle: "@nokau.gb",
  facebook: "https://www.facebook.com/share/1T3LR5ewv7/",
  tiktok: "https://www.tiktok.com/@no_kau",
  tiktokHandle: "@no_kau",
  email: null as string | null, // a confirmar
  // Botão flutuante e contacto por WhatsApp. ⚠ CONFIRMAR com o restaurante que este número tem WhatsApp
  // (se não tiver, o WhatsApp mostra "este número não está no WhatsApp"). Para esconder o botão: null.
  whatsappE164: "+245957616701" as string | null,
  hours: null as null | { days: string; time: string }[], // a confirmar
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

const q = encodeURIComponent(site.plusCode);
export const mapsLinks = {
  directions: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  search: `https://www.google.com/maps/search/?api=1&query=${q}`,
} as const;

export const nav = [
  { href: "/menu", label: "Menu" },
  { href: "/cultura", label: "Cultura" },
  { href: "/eventos", label: "Eventos" },
  { href: "/sobre", label: "Sobre nós" },
  { href: "/contacto", label: "Contacto" },
] as const;

/** Link SMS com mensagem pré-preenchida (funciona em Android e iPhone). */
export function smsLink(body: string) {
  return `sms:${site.phoneE164}?&body=${encodeURIComponent(body)}`;
}

/** Redes sociais do restaurante (rodapé, página Contacto e dados para o Google). */
export const socials: { name: string; handle: string; url: string }[] = [
  { name: "Instagram", handle: site.instagramHandle, url: site.instagram },
  { name: "Facebook", handle: "Nô Kau", url: site.facebook },
  { name: "TikTok", handle: site.tiktokHandle, url: site.tiktok },
];
