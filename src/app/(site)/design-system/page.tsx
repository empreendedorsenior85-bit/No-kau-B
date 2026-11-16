import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { DiamondBand, DiamondMark } from "@/components/brand/DiamondPattern";
import { ZincDivider } from "@/components/brand/ZincDivider";
import { BrandLoader } from "@/components/brand/BrandLoader";
import { Badge, reservationStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/motion/Reveal";
import { contrast, wcag } from "@/lib/contrast";
import { formatXOF } from "@/lib/format";

export const metadata: Metadata = { title: "Design System", robots: { index: false } };

const colors = [
  { name: "gold", hex: "#A9862C", note: "Logótipo — círculo" },
  { name: "umber", hex: "#5F4923", note: "Logótipo — lema" },
  { name: "white", hex: "#FFFFFF", note: "Logótipo — nome e retrato" },
  { name: "gold-300", hex: "#D1B261", note: "Dourado legível sobre escuro" },
  { name: "gold-100", hex: "#F2EBD9", note: "Superfície clara de destaque" },
  { name: "kau-800", hex: "#362C1C", note: "Bordas sobre escuro" },
  { name: "kau-900", hex: "#231C10", note: "Superfície elevada" },
  { name: "kau-950", hex: "#151109", note: "Fundo da noite" },
  { name: "mist", hex: "#B6AC9A", note: "Secundário sobre escuro" },
  { name: "stone", hex: "#6E6553", note: "Secundário sobre claro" },
];

const pairs: [string, string, string][] = [
  ["Branco sobre fundo da noite", "#FFFFFF", "#151109"],
  ["Dourado 300 sobre fundo da noite", "#D1B261", "#151109"],
  ["Dourado do logótipo sobre fundo da noite", "#A9862C", "#151109"],
  ["Botão primário (texto escuro sobre dourado)", "#151109", "#A9862C"],
  ["Mist sobre fundo da noite", "#B6AC9A", "#151109"],
  ["Umber sobre branco", "#5F4923", "#FFFFFF"],
  ["Stone sobre branco", "#6E6553", "#FFFFFF"],
  ["Branco sobre dourado (como no logótipo)", "#FFFFFF", "#A9862C"],
];

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-kau-800 py-16">
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 font-display text-3xl text-white sm:text-4xl">{title}</h2>
      </Reveal>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export default function DesignSystem() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-24 sm:px-10">
      <header className="flex flex-col gap-8 pb-16 pt-32 sm:flex-row sm:items-center">
        <Logo size={128} priority />
        <div>
          <Eyebrow>Design System</Eyebrow>
          <h1 className="mt-3 font-display text-5xl text-white sm:text-6xl">
            A voz <em className="text-gold-300">da casa</em>
          </h1>
          <p className="mt-4 max-w-xl text-mist">
            Todas as cores derivam das três cores do logótipo (dourado, castanho do lema e branco), variando apenas a
            luminosidade. Os motivos gráficos vêm dos materiais reais da sala.
          </p>
        </div>
      </header>

      <Section eyebrow="01" title="Cores">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {colors.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-2xl bg-kau-900 ring-1 ring-kau-800">
              <div className="h-24" style={{ background: c.hex }} />
              <div className="p-3">
                <p className="text-sm font-medium text-white">{c.name}</p>
                <p className="font-mono text-xs text-mist">{c.hex}</p>
                <p className="mt-1 text-xs text-mist">{c.note}</p>
              </div>
            </div>
          ))}
        </div>

        <h3 className="mt-12 font-display text-2xl text-white">Contraste (WCAG 2.x, calculado)</h3>
        <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-kau-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-kau-900 text-mist">
              <tr>
                <th className="p-3 font-medium">Combinação</th>
                <th className="p-3 font-medium">Amostra</th>
                <th className="p-3 font-medium">Rácio</th>
                <th className="p-3 font-medium">Nível</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map(([label, fg, bg]) => {
                const r = contrast(fg, bg);
                const level = wcag(r);
                return (
                  <tr key={label} className="border-t border-kau-800">
                    <td className="p-3 text-white">{label}</td>
                    <td className="p-3">
                      <span className="whitespace-nowrap rounded-md px-3 py-1.5" style={{ color: fg, background: bg }}>
                        Nô Kau 6 500 FCFA
                      </span>
                    </td>
                    <td className="p-3 font-mono text-white">{r.toFixed(2)}:1</td>
                    <td className="p-3">
                      <Badge tone={level === "Falha" ? "danger" : level === "AA grande" ? "pending" : "ok"}>{level}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="02" title="Tipografia">
        <div className="space-y-8">
          <div>
            <p className="text-xs text-mist">Display · Playfair Display</p>
            <p className="font-display text-6xl leading-tight text-white">Sabores de Bissau</p>
            <p className="font-display text-4xl italic text-gold-300">uma experiência.</p>
          </div>
          <div>
            <p className="text-xs text-mist">Texto · Inter</p>
            <p className="max-w-prose text-lg leading-relaxed text-white">
              Grelhados, cocktails e noites de música. Ç ã õ é ê ô — acentuação completa para português e francês.
            </p>
          </div>
          <div className="grid gap-3 text-white">
            {[
              ["Display XL", "font-display text-7xl"],
              ["H1", "font-display text-5xl"],
              ["H2", "font-display text-4xl"],
              ["H3", "font-display text-2xl"],
              ["Corpo", "text-base"],
              ["Pequeno", "text-sm"],
            ].map(([n, c]) => (
              <div key={n} className="flex items-baseline gap-6 border-b border-kau-800 pb-3">
                <span className="w-24 shrink-0 text-xs text-mist">{n}</span>
                <span className={`${c} truncate`}>Nô Kau</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section eyebrow="03" title="Botões e estados">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Explorar Menu</Button>
          <Button variant="outline">Reservar Mesa</Button>
          <Button variant="ghost">Ver mais →</Button>
          <Button disabled>Indisponível</Button>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          {Object.values(reservationStatus).map((s) => (
            <Badge key={s.label} tone={s.tone}>
              {s.label}
            </Badge>
          ))}
          <Badge tone="demo">Dados de demonstração</Badge>
          <Badge tone="gold">Música ao vivo</Badge>
        </div>
      </Section>

      <Section eyebrow="04" title="Cartão de produto (menu)">
        <p className="-mt-4 mb-8 max-w-prose text-sm text-mist">
          Sem fotografia real, o cartão funciona em modo tipográfico — nunca com foto genérica. O selo
          “Demonstração” é obrigatório em qualquer dado de teste.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <article
              key={i}
              className="group relative overflow-hidden rounded-2xl bg-kau-900 p-6 ring-1 ring-kau-800 transition-[transform,box-shadow] duration-500 ease-[var(--ease-luxe)] hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(169,134,44,0.35)]"
            >
              <DiamondMark className="absolute -right-4 -top-4 text-gold/10 transition-transform duration-700 group-hover:rotate-45" size={110} />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge tone="demo">Demonstração</Badge>
                  <h3 className="mt-4 font-display text-2xl text-white">Prato exemplo {i + 1}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist">
                    Descrição do prato introduzida pelo restaurante no painel.
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl text-gold-300">{formatXOF(i ? 4000 : 6500)}</p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.18em] text-mist">{i ? "Indisponível" : "Disponível"}</span>
                <Button size="md" variant={i ? "outline" : "primary"} disabled={!!i}>
                  Adicionar
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="05" title="Motivos do salão">
        <div className="space-y-10 text-gold">
          <div>
            <p className="mb-3 text-xs text-mist">Faixa de losangos — caminho de mesa tecido</p>
            <DiamondBand id="ds-band" opacity={0.7} />
          </div>
          <div>
            <p className="mb-3 text-xs text-mist">Linha ondulada — rodapé da sala</p>
            <ZincDivider className="text-gold/60" />
          </div>
          <div className="flex items-center gap-10">
            <DiamondMark size={56} />
            <BrandLoader />
          </div>
        </div>
      </Section>

      <Section eyebrow="06" title="Princípios de movimento">
        <ul className="grid gap-4 text-sm text-white sm:grid-cols-2">
          {[
            ["Foco de luz", "O Hero revela a fotografia como um spot (máscara radial, 2.2s)."],
            ["Discrição", "Deslocações de 8–16px, fade, easing cubic-bezier(.22,1,.36,1)."],
            ["Desempenho", "Só transform e opacity; LazyMotion; CSS puro em botões e loader."],
            ["Acessibilidade", "prefers-reduced-motion respeitado: sem parallax nem revelações."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-2xl bg-kau-900 p-5 ring-1 ring-kau-800">
              <p className="font-display text-lg text-gold-300">{t}</p>
              <p className="mt-1 text-mist">{d}</p>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
