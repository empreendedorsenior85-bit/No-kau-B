import { site } from "@/lib/site";

const MESSAGE = "Olá Nô Kau! Gostaria de mais informações.";

/**
 * Botão flutuante de WhatsApp (site público). Link simples (funciona sem JavaScript);
 * no telemóvel fica acima da barra Ligar/Reservar/Direções. Sem número configurado, não aparece.
 */
export function WhatsAppFloat() {
  if (!site.whatsappE164) return null;
  const href = `https://wa.me/${site.whatsappE164.replace(/\D/g, "")}?text=${encodeURIComponent(MESSAGE)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com o Nô Kau no WhatsApp"
      title="Falar connosco no WhatsApp"
      data-testid="whatsapp-float"
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.55)] ring-2 ring-white/20 transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold-300 active:scale-95 lg:bottom-8 lg:right-8 print:hidden"
    >
      <svg aria-hidden viewBox="0 0 32 32" width="30" height="30" fill="currentColor">
        <path d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.54 1.75 6.52L3 29l6.65-1.74A12.98 12.98 0 0 0 16.04 29C23.2 29 29.03 23.18 29.03 16S23.2 3 16.04 3Zm0 23.62c-2.04 0-4.04-.55-5.78-1.6l-.41-.24-3.95 1.03 1.05-3.85-.27-.4A10.6 10.6 0 0 1 5.42 16c0-5.86 4.77-10.62 10.62-10.62S26.66 10.14 26.66 16 21.9 26.62 16.04 26.62Zm5.83-7.95c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1.01 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66s1.15 3.09 1.31 3.3c.16.21 2.26 3.45 5.47 4.84.76.33 1.36.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.89-.77 2.16-1.52.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37Z" />
      </svg>
    </a>
  );
}
