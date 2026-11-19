"use client";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { removeReceiptLogoAction, saveReceiptSettingsAction, uploadReceiptLogoAction } from "@/app/admin/actions";
import { DEFAULT_RECEIPT_SETTINGS, columnsFor, receiptSettingsSchema, type ReceiptSettings, type TextSize } from "@/lib/receipt/settings";
import { demoOrderTicket, demoReceipt, orderTicketDoc, receiptDoc } from "@/lib/receipt/doc";
import { ThermalPaper } from "@/components/receipt/ThermalPaper";

type Msg = { ok: boolean; text: string } | null;
const field = "mt-1 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 py-2.5 text-sm text-white placeholder:text-mist/50 focus:border-gold-300 focus:outline-none";

function Switch({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div><p className="text-sm text-white" id={`${id}-l`}>{label}</p>{hint && <p className="text-xs text-mist">{hint}</p>}</div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-l`} data-testid={`sw-${id}`} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-gold" : "bg-kau-800"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-kau-800 bg-kau-900 p-5" aria-labelledby={`sec-${n}`}>
      <h2 id={`sec-${n}`} className="font-display text-xl text-white"><span className="mr-2 text-gold-300">{n}.</span>{title}</h2>
      {sub && <p className="mt-1 text-xs text-mist">{sub}</p>}
      <div className="mt-3 divide-y divide-kau-800/60">{children}</div>
    </section>
  );
}

function TextField({ id, label, value, onChange, max, area, placeholder, error }: { id: string; label: string; value: string; onChange: (v: string) => void; max: number; area?: boolean; placeholder?: string; error?: string }) {
  return (
    <label className="block py-2.5 text-sm text-mist" htmlFor={id}>
      <span className="flex justify-between"><span>{label}</span><span className="text-xs">{value.length}/{max}</span></span>
      {area
        ? <textarea id={id} data-testid={`tx-${id}`} value={value} maxLength={max} rows={2} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={field} />
        : <input id={id} data-testid={`tx-${id}`} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={field} />}
      {error && <span role="alert" className="mt-1 block text-xs text-[#e48a7d]">{error}</span>}
    </label>
  );
}

export function ReceiptSettingsEditor({ initial, logo, readOnly, updated }: {
  initial: ReceiptSettings; logo: { has: boolean; version: number }; readOnly: boolean; updated: { at: string; by: string | null };
}) {
  const [s, setS] = useState<ReceiptSettings>(initial);
  const [saved, setSaved] = useState<string>(JSON.stringify(initial));
  const [logoState, setLogo] = useState(logo);
  const [kind, setKind] = useState<"receipt" | "ticket">("receipt");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const previewRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(s) !== saved;

  // alteração imutável de um campo: set("footer", "qr", true)
  const set = <K extends keyof ReceiptSettings, F extends keyof ReceiptSettings[K]>(k: K, f: F, v: ReceiptSettings[K][F]) =>
    setS((cur) => ({ ...cur, [k]: { ...(cur[k] as object), [f]: v } }));

  // validação no navegador com o MESMO esquema do servidor (o servidor valida outra vez ao guardar)
  const check = receiptSettingsSchema.safeParse(s);
  const errors = new Map<string, string>();
  if (!check.success) for (const i of check.error.issues) errors.set(i.path.join("."), i.message);
  if (s.footer.qr && !s.footer.qrUrl) errors.set("footer.qrUrl", "Indique o endereço da loja online para mostrar o QR Code.");

  const now = useMemo(() => new Date().toISOString(), []);
  const doc = useMemo(() => kind === "receipt"
    ? receiptDoc(s, demoReceipt(now), { address: "Rua 7, Bissau, Guiné-Bissau", phone: "+245 957 616 701" })
    : orderTicketDoc(s, demoOrderTicket(now), s.format.paper), [s, kind, now]);
  const logoUrl = logoState.has ? `/api/receipt-logo?v=${logoState.version}` : null;

  const save = () => start(async () => {
    if (errors.size) { setMsg({ ok: false, text: [...errors.values()][0] }); return; }
    const r = await saveReceiptSettingsAction(s).catch((e: Error) => ({ ok: false as const, message: e.message }));
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) setSaved(JSON.stringify(s));
  });
  const upload = (file: File) => start(async () => {
    const fd = new FormData(); fd.set("logo", file);
    const r = await uploadReceiptLogoAction(fd).catch((e: Error) => ({ ok: false as const, message: e.message }));
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok && "version" in r) setLogo({ has: true, version: r.version });
    if (fileRef.current) fileRef.current.value = "";
  });
  const removeLogo = () => start(async () => {
    const r = await removeReceiptLogoAction();
    setMsg({ ok: r.ok, text: r.message }); setLogo((l) => ({ has: false, version: l.version + 1 }));
  });

  const sizes: { id: TextSize; label: string; hint: string }[] = [
    { id: "small", label: "Pequeno", hint: "Mais texto por linha" }, { id: "medium", label: "Médio", hint: "Recomendado" }, { id: "large", label: "Grande", hint: "Letras altas, fácil de ler" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      <div className="space-y-5" data-testid="receipt-settings-form">
        {readOnly && <p role="status" className="rounded-xl border border-gold/40 bg-gold/5 p-4 text-sm text-gold-300">Servidor do restaurante: a personalização é feita no site central e chega aqui sozinha (só leitura).</p>}

        <Section n={2} title="Cabeçalho" sub="Topo do recibo: logótipo, nome da loja e mensagem de boas-vindas.">
          <Switch id="showLogo" label="Exibir logótipo no topo do bilhete" checked={s.header.showLogo} onChange={(v) => set("header", "showLogo", v)} />
          <div className="flex flex-wrap items-center gap-3 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="Logótipo atual" data-testid="logo-current" className="h-16 w-auto rounded bg-white p-1" /> : <span className="text-xs text-mist">Sem logótipo.</span>}
            {!readOnly && (
              <>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="logo-file" data-testid="logo-file"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
                <label htmlFor="logo-file" className="cursor-pointer rounded-full border border-gold/60 px-4 py-2 text-sm text-gold-300 hover:bg-gold/10">{logoUrl ? "Trocar logótipo" : "Carregar logótipo"}</label>
                {logoUrl && <button type="button" onClick={removeLogo} data-testid="logo-remove" className="rounded-full border border-kau-800 px-4 py-2 text-sm text-mist hover:text-white">Remover</button>}
                <span className="w-full text-xs text-mist">PNG ou JPG até 900 KB. Na impressora sai a preto e branco (como na pré-visualização).</span>
              </>
            )}
          </div>
          <Switch id="showStoreName" label="Mostrar o nome da loja" checked={s.header.showStoreName} onChange={(v) => set("header", "showStoreName", v)} />
          <TextField id="storeName" label="Nome da loja" value={s.header.storeName} max={40} onChange={(v) => set("header", "storeName", v)} error={errors.get("header.storeName")} />
          <Switch id="showContacts" label="Mostrar morada e telefone" checked={s.header.showContacts} onChange={(v) => set("header", "showContacts", v)} />
          <TextField id="headerText" area label="Texto do cabeçalho (abaixo do nome da loja)" value={s.header.headerText} max={160} onChange={(v) => set("header", "headerText", v)} placeholder="Bem-vindo ao nosso restaurante!" />
        </Section>

        <Section n={3} title="Informações da venda">
          <Switch id="saleNumber" label="Número do bilhete" hint="Recibo: REC-…; talão: número do pedido." checked={s.sale.number} onChange={(v) => set("sale", "number", v)} />
          <Switch id="saleDate" label="Data da venda" checked={s.sale.date} onChange={(v) => set("sale", "date", v)} />
          <Switch id="saleTime" label="Hora da venda" checked={s.sale.time} onChange={(v) => set("sale", "time", v)} />
          <Switch id="saleStaff" label="Funcionário responsável" hint="Recibo: quem recebeu; talão: quem aceitou o pedido." checked={s.sale.staff} onChange={(v) => set("sale", "staff", v)} />
          <Switch id="saleTable" label="Mesa" checked={s.sale.table} onChange={(v) => set("sale", "table", v)} />
        </Section>

        <Section n={4} title="Informações do cliente" sub="Só aparece quando o pedido tem conta de cliente; campos vazios nunca são impressos.">
          <Switch id="custName" label="Nome do cliente" checked={s.customer.name} onChange={(v) => set("customer", "name", v)} />
          <Switch id="custPhone" label="Telefone do cliente" checked={s.customer.phone} onChange={(v) => set("customer", "phone", v)} />
          <p className="py-2.5 text-xs text-mist">Endereço de entrega: o Nô Kau ainda não faz entregas pelo sistema — quando existir, aparece aqui.</p>
        </Section>

        <Section n={5} title="Detalhes financeiros" sub="Valores sempre calculados a partir do pagamento real.">
          <Switch id="finSubtotal" label="Subtotal" checked={s.finance.subtotal} onChange={(v) => set("finance", "subtotal", v)} />
          <Switch id="finTotal" label="Total final" checked={s.finance.total} onChange={(v) => set("finance", "total", v)} />
          <Switch id="finMethod" label="Método de pagamento" checked={s.finance.method} onChange={(v) => set("finance", "method", v)} />
          <Switch id="finTendered" label="Valor recebido" hint="Só em numerário." checked={s.finance.tendered} onChange={(v) => set("finance", "tendered", v)} />
          <Switch id="finChange" label="Troco devolvido" hint="Só em numerário." checked={s.finance.change} onChange={(v) => set("finance", "change", v)} />
          <Switch id="finCurrency" label="Moeda utilizada (FCFA / XOF)" checked={s.finance.currency} onChange={(v) => set("finance", "currency", v)} />
          <p className="py-2.5 text-xs text-mist">Descontos, impostos/taxas e taxa de entrega: o sistema ainda não os regista — não são mostrados valores inventados.</p>
        </Section>

        <Section n={6} title="Rodapé" sub="QR Code da loja online, agradecimento, nota e informação fiscal.">
          <Switch id="qr" label="Código QR da loja online" checked={s.footer.qr} onChange={(v) => set("footer", "qr", v)} />
          <TextField id="qrUrl" label="Endereço da loja online" value={s.footer.qrUrl} max={200} placeholder="https://nokau.vercel.app/menu" onChange={(v) => set("footer", "qrUrl", v)} error={errors.get("footer.qrUrl")} />
          <TextField id="qrText" label="Texto abaixo do QR Code" value={s.footer.qrText} max={80} onChange={(v) => set("footer", "qrText", v)} />
          <TextField id="thanks" area label="Mensagem de agradecimento" value={s.footer.thanks} max={200} onChange={(v) => set("footer", "thanks", v)} />
          <Switch id="printedAt" label="Data e hora de impressão" checked={s.footer.printedAt} onChange={(v) => set("footer", "printedAt", v)} />
          <TextField id="note" area label="Nota especial" value={s.footer.note} max={240} onChange={(v) => set("footer", "note", v)} />
          <TextField id="nif" label="NIF (opcional)" value={s.footer.nif} max={30} onChange={(v) => set("footer", "nif", v)} error={errors.get("footer.nif")} />
          <TextField id="returns" area label="Condições de devolução (opcional)" value={s.footer.returns} max={240} onChange={(v) => set("footer", "returns", v)} />
          <TextField id="legal" area label="Avisos legais (opcional)" value={s.footer.legal} max={240} onChange={(v) => set("footer", "legal", v)} />
        </Section>

        <Section n={8} title="Formato de impressão" sub="Aplica-se ao recibo e aos talões impressos. Cada impressora usa a largura do papel que tem (definida em Impressoras); esta largura é a do recibo no ecrã/PDF e das impressoras novas.">
          <div className="grid grid-cols-2 gap-3 py-3" role="radiogroup" aria-label="Largura do papel">
            {([58, 80] as const).map((w) => (
              <button key={w} type="button" role="radio" aria-checked={s.format.paper === w} data-testid={`paper-${w}`} onClick={() => set("format", "paper", w)}
                className={`rounded-2xl border p-4 text-left ${s.format.paper === w ? "border-gold bg-gold/10" : "border-kau-800 hover:border-gold/50"}`}>
                <p className="font-display text-lg text-white">{w === 58 ? "57/58 mm" : "80 mm"}</p>
                <p className="text-xs text-mist">{w === 58 ? "Formato estreito — impressoras compactas" : "Formato standard — mais informação"}</p>
                <p className="mt-1 text-xs text-gold-300">{columnsFor(w, s.format.textSize)} colunas</p>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 py-3" role="radiogroup" aria-label="Tamanho do texto">
            {sizes.map((z) => (
              <button key={z.id} type="button" role="radio" aria-checked={s.format.textSize === z.id} data-testid={`size-${z.id}`} onClick={() => set("format", "textSize", z.id)}
                className={`rounded-2xl border p-3 text-left ${s.format.textSize === z.id ? "border-gold bg-gold/10" : "border-kau-800 hover:border-gold/50"}`}>
                <p className="text-sm text-white">{z.label}</p><p className="text-xs text-mist">{z.hint}</p>
              </button>
            ))}
          </div>
          <Switch id="autoPrint" label="Imprimir o recibo no balcão ao confirmar o pagamento" hint="No servidor do restaurante, nas impressoras do balcão ativas." checked={s.autoPrintReceipt} onChange={(v) => setS((c) => ({ ...c, autoPrintReceipt: v }))} />
        </Section>

        {!readOnly && (
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-kau-800 bg-kau-950/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
            <button type="button" onClick={save} disabled={pending || !dirty} data-testid="save" className="rounded-full bg-gold px-6 py-3 text-sm font-medium text-kau-950 disabled:opacity-40">
              {pending ? "A guardar…" : dirty ? "Guardar alterações" : "Guardado"}
            </button>
            <button type="button" data-testid="reset" onClick={() => { setS(DEFAULT_RECEIPT_SETTINGS); setMsg({ ok: true, text: "Valores padrão repostos na pré-visualização — clique em Guardar para aplicar." }); }}
              className="rounded-full border border-kau-800 px-5 py-3 text-sm text-mist hover:text-white">Restaurar padrão</button>
            <button type="button" data-testid="preview-btn" onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="rounded-full border border-gold/60 px-5 py-3 text-sm text-gold-300 hover:bg-gold/10 lg:hidden">Pré-visualizar</button>
            {msg && <p role={msg.ok ? "status" : "alert"} data-testid="settings-msg" className={`w-full text-sm ${msg.ok ? "text-[#7fc290]" : "text-[#e48a7d]"}`}>{msg.text}</p>}
            <p className="w-full text-xs text-mist">Última alteração: {new Date(updated.at).toLocaleString("pt-PT", { timeZone: "Africa/Bissau" })}{updated.by ? ` por ${updated.by}` : ""}</p>
          </div>
        )}
      </div>

      {/* 1. Visão geral do ticket — pré-visualização ao vivo */}
      <aside ref={previewRef} className="scroll-mt-28 lg:sticky lg:top-24 lg:self-start" aria-labelledby="sec-1">
        <div className="rounded-2xl border border-kau-800 bg-kau-900 p-4">
          <h2 id="sec-1" className="font-display text-xl text-white"><span className="mr-2 text-gold-300">1.</span>Visão geral do ticket</h2>
          <p className="mt-1 text-xs text-mist">Atualiza ao alterar qualquer opção. Dados de <strong className="text-gold-300">demonstração</strong> — não é uma venda.</p>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-kau-800 p-1 text-sm" role="tablist">
            {(["receipt", "ticket"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={kind === k} data-testid={`preview-${k}`} onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 ${kind === k ? "bg-gold text-kau-950" : "text-mist hover:text-white"}`}>{k === "receipt" ? "Recibo de pagamento" : "Talão da cozinha"}</button>
            ))}
          </div>
          <div className="mt-4 max-h-[75vh] overflow-auto rounded-xl bg-kau-950 p-4">
            <ThermalPaper doc={doc} logoUrl={logoUrl} testId="preview-paper" />
          </div>
        </div>
      </aside>
    </div>
  );
}
