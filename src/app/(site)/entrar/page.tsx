import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/layout/PageHero";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };

const OPTIONS = [
  { href: "/cliente/entrar", id: "login-cliente", title: "Conta de cliente", text: "Os seus pedidos à mesa, o estado e os recibos dos pagamentos.", cta: "Entrar ou criar conta" },
  { href: "/minhas-reservas", id: "login-reservas", title: "As minhas reservas", text: "Sem palavra-passe: veja e acompanhe as reservas feitas neste telemóvel.", cta: "Ver reservas" },
  { href: "/admin/login", id: "login-equipa", title: "Equipa do restaurante", text: "Administração, gerência e garçons: pedidos, mesas, pagamentos e relatórios.", cta: "Entrar no painel" },
];

/** Ponto único de entrada: o cliente, o visitante das reservas e a equipa encontram aqui o seu acesso. */
export default function Page() {
  return (
    <main>
      <PageHero eyebrow="Acesso" title={<>Entrar no <em className="text-gold-300">Nô Kau</em>.</>} intro="Escolha o seu acesso." />
      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-14 sm:grid-cols-3 sm:px-8">
        {OPTIONS.map((o) => (
          <Link key={o.href} href={o.href} data-testid={o.id}
            className="flex flex-col rounded-2xl border border-kau-800 bg-kau-900 p-6 transition-colors hover:border-gold/60">
            <span className="font-display text-2xl text-white">{o.title}</span>
            <span className="mt-2 flex-1 text-sm text-mist">{o.text}</span>
            <span className="mt-5 text-sm font-medium text-gold-300">{o.cta} →</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
