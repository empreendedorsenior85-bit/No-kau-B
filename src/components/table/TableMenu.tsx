"use client";
import { useEffect, useRef, useState } from "react";
import { newKey, isValidKey, useCart } from "@/lib/cart";
import { sendOrder } from "@/lib/send-order";
import { formatXOF } from "@/lib/format";
import { isIllustrative } from "@/lib/illustrative";
import { PAYMENT_ACCEPTED_TEXT, formatOrderNumber } from "@/lib/types";
import { deleteRecord, flushOutbox, outboxAvailable, putRecord, recordsFor, requestBackgroundSync, type OutboxRecord } from "@/lib/outbox";
import { useOffline } from "@/components/pwa/useOffline";
import { TableHelp } from "./TableHelp";
import { AccountGate } from "./AccountGate";
import { Logo } from "@/components/brand/Logo";
import { DiamondMark } from "@/components/brand/DiamondPattern";
import { Button } from "@/components/ui/Button";

export type MenuItemView = {
  id: number; categoryId: string; name: string; description: string; price: number;
  available: boolean; isDemo: boolean; imageUrl: string | null;
};
export type MenuCategoryView = { id: string; label: string; description: string; items: MenuItemView[] };

export function TableMenu({ token, table, categories, customer = null, staff = false }: { token: string; table: { number: number; label: string }; categories: MenuCategoryView[]; customer?: { name: string } | null; staff?: boolean }) {
  const all = categories.flatMap((c) => c.items);
  const cart = useCart(token, all);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [gone, setGone] = useState<Set<number>>(new Set()); // produtos que o servidor disse já não estarem disponíveis
  const sending = useRef(false);
  const [active, setActive] = useState(categories[0]?.id);
  // conta obrigatória para enviar (a equipa com sessão pode registar pedidos em nome da mesa)
  const canSend = !!customer || staff;
  const [gateWanted, setGate] = useState(false);
  const gate = gateWanted && !canSend; // com conta (ex.: acabou de entrar), o painel de conta deixa de fazer sentido
  // de volta do login/registo feito a partir do carrinho: reabre o carrinho
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("carrinho") !== "1") return;
    window.history.replaceState(null, "", `/m/${token}`);
    const t = setTimeout(() => setOpen(true), 0); // depois da hidratação (o carrinho já foi lido do telemóvel)
    return () => clearTimeout(t);
  }, [token]);
  // Fotos só depois de a página ficar interativa: em rede lenta, os botões "Adicionar" funcionam primeiro
  // (as fotos não competem com o JavaScript). Ficam guardadas para a próxima visita.
  const [imagesOn, setImagesOn] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => setImagesOn(true), { timeout: 800 });
    else setTimeout(() => setImagesOn(true), 50);
  }, []);
  const net = useOffline(all.map((i) => i.imageUrl).filter((u): u is string => !!u));
  const [records, setRecords] = useState<OutboxRecord[]>([]);
  const [outboxOk, setOutboxOk] = useState<boolean | null>(null);
  const [flushingNow, setFlushingNow] = useState(false);

  // fila de pedidos guardados no telemóvel: mostra o estado e envia sozinha quando há rede
  useEffect(() => {
    let stop = false;
    const refresh = async () => { try { const r = await recordsFor(token); if (!stop) setRecords(r); } catch {} };
    const flush = async () => {
      if (!navigator.onLine) return;
      setFlushingNow(true);
      try { await flushOutbox(); } finally { if (!stop) setFlushingNow(false); }
      await refresh();
    };
    outboxAvailable().then((ok) => { if (stop) return; setOutboxOk(ok); if (ok) { refresh(); flush(); } });
    const onOnline = () => flush();
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "outbox-updated") refresh(); };
    window.addEventListener("online", onOnline);
    navigator.serviceWorker?.addEventListener("message", onMsg);
    const t = setInterval(() => { if (document.visibilityState === "visible") flush(); }, 10_000);
    return () => { stop = true; clearInterval(t); window.removeEventListener("online", onOnline); navigator.serviceWorker?.removeEventListener("message", onMsg); };
  }, [token]);
  const queuedCount = records.filter((r) => r.state === "queued").length;

  // destaque da categoria visível
  useEffect(() => {
    const els = categories.map((c) => document.getElementById(`cat-${c.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [categories]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [open]);

  const qtyOf = (id: number) => cart.lines.find((l) => l.itemId === id)?.qty ?? 0;

  const send = async () => {
    if (!canSend) { setGate(true); return; }
    if (sending.current || cart.lines.length === 0) return;
    sending.current = true; // trava imediata contra duplo toque
    setPending(true);
    setRetrying(false);
    setError(null);
    const key = isValidKey(cart.key) ? cart.key : newKey();
    const lines = cart.lines.map((l) => ({ itemId: l.itemId, quantity: l.qty, note: l.note.trim() || undefined }));
    // 1) guardar o pedido NO TELEMÓVEL antes de o enviar (sem rede, a meio do envio, página fechada: não se perde)
    let queued = false;
    if (outboxOk) {
      try {
        await putRecord({ key, token, tableLabel: table.label, lines: cart.lines.map((l) => ({ ...l })), estTotal: cart.total, createdAt: Date.now(), state: "queued", attempts: 0 });
        queued = true;
      } catch {}
    }
    const keepQueued = async () => {
      cart.reset();
      setOpen(false);
      setRecords(await recordsFor(token));
      requestBackgroundSync();
    };
    try {
      if (queued && !navigator.onLine) { await keepQueued(); return; }
      const r = await sendOrder({ token, key, lines }, () => setRetrying(true));
      if (r.ok) {
        if (queued) await putRecord({ key, token, tableLabel: table.label, lines: cart.lines.map((l) => ({ ...l })), estTotal: cart.total, createdAt: Date.now(), state: "sent", attempts: 1, sentAt: Date.now(), orderId: r.orderId, number: r.number, origin: r.origin }).catch(() => {});
        cart.reset();
        // navegação completa de propósito: não depende de pedidos extra à rede para mostrar a confirmação
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/m/${token}/pedido/${r.orderId}`);
        return; // mantém a trava até a navegação
      }
      // a sessão terminou entretanto: entra de novo (o carrinho continua) — não é falha do pedido
      if (r.loginRequired) {
        if (queued) await deleteRecord(key).catch(() => {});
        // recarrega já sem sessão: o carrinho (guardado no telemóvel) reabre a pedir para entrar
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/m/${token}?carrinho=1`);
        return; // mantém a trava até a navegação
      }
      // falha de rede/servidor (não do pedido): fica guardado e segue sozinho quando houver ligação
      if (queued && (r.network || r.temporary)) { await keepQueued(); return; }
      if (queued) await deleteRecord(key).catch(() => {});
      if (r.itemIds?.length) { cart.remove(r.itemIds); setGone((g) => new Set([...g, ...r.itemIds!])); }
      setError(r.message + (r.itemIds?.length ? " Retirámos esses produtos do seu pedido." : ""));
    } catch {
      if (queued) { await keepQueued(); return; }
      setError("Não foi possível enviar o pedido. O pedido está guardado — tente novamente.");
    } finally {
      setPending(false);
      setRetrying(false);
      sending.current = false;
    }
  };

  const removeRecord = async (key: string) => { await deleteRecord(key).catch(() => {}); setRecords(await recordsFor(token)); };

  const scrollTo = (id: string) => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="nums-lining min-h-svh bg-kau-950 pb-28">
      {/* fundo inativo enquanto o carrinho está aberto (teclado e leitores de ecrã ficam só no carrinho) */}
      <div inert={open}>
      <header className="sticky top-0 z-30 border-b border-kau-800 bg-kau-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <Logo size={40} priority className="h-10 w-10" />
            <span className="font-display text-lg text-white">Nô Kau</span>
          </div>
          <span className="rounded-full border border-gold/60 bg-gold/10 px-4 py-1.5 font-display text-gold-300" aria-label={`Está na ${table.label}`}>
            {table.label}
          </span>
        </div>
        <nav aria-label="Categorias" className="mx-auto max-w-3xl overflow-x-auto px-3 pb-3 [scrollbar-width:none]">
          <ul className="flex gap-2">
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => scrollTo(c.id)}
                  aria-current={active === c.id ? "true" : undefined}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors ${
                    active === c.id ? "bg-gold text-kau-950" : "bg-kau-900 text-mist"
                  }`}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 pt-6">
        <h1 className="font-display text-3xl leading-tight text-white">Faça o seu pedido</h1>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          Escolha os produtos e envie. O pedido vai direto para o restaurante e é associado à <strong className="text-white">{table.label}</strong>. O pagamento é feito no restaurante.
        </p>

        {/* estado da ligação e do funcionamento sem internet */}
        {!net.online ? (
          <p role="status" data-testid="net-offline" className="mt-4 rounded-2xl border border-[#e0a64a]/50 bg-[#e0a64a]/10 px-4 py-3 text-sm leading-relaxed text-[#f3d29b]">
            <strong className="text-white">Sem internet.</strong> Está a ver o menu guardado neste telemóvel. Pode pedir na mesma: o pedido fica
            guardado e é enviado sozinho quando a ligação voltar.
          </p>
        ) : net.saved ? (
          <p data-testid="offline-ready" className="mt-3 text-xs text-mist">✓ Menu guardado neste telemóvel — funciona mesmo que a internet falhe.</p>
        ) : null}

        <p className="mt-4 text-sm text-mist" data-testid="client-link">
          {customer ? (
            <>Olá, <strong className="text-white">{customer.name.split(" ")[0]}</strong> — os pedidos ficam na sua conta. <a href="/cliente" className="text-gold-300 underline underline-offset-4">Os meus pedidos</a></>
          ) : (
            staff ? <>Sessão da equipa: pode registar pedidos em nome desta mesa.</> :
            <>Para pedir é preciso conta: <a href={`/cliente/entrar?volta=${encodeURIComponent(`/m/${token}`)}`} className="text-gold-300 underline underline-offset-4">entrar</a> ou <a href={`/cliente/registo?volta=${encodeURIComponent(`/m/${token}`)}`} className="text-gold-300 underline underline-offset-4">criar conta</a> — os pedidos, pagamentos e recibos ficam guardados.</>
          )}
        </p>

        <TableHelp token={token} online={net.online} />

        {records.length > 0 && (
          <section aria-labelledby="meus-pedidos" data-testid="outbox" className="mt-5 rounded-2xl border border-kau-800 bg-kau-900 p-4">
            <h2 id="meus-pedidos" className="font-display text-xl text-white">Os seus pedidos</h2>
            <ul className="mt-3 space-y-3">
              {records.map((r) => (
                <li key={r.key} data-testid="outbox-item" data-state={r.state} className="rounded-xl border border-kau-800 p-3 text-sm">
                  {r.state === "queued" && r.needsLogin && (
                    <p className="font-medium text-[#f3d29b]" data-testid="outbox-needs-login">
                      Guardado — <a href={`/cliente/entrar?volta=${encodeURIComponent(`/m/${token}`)}`} className="text-gold-300 underline underline-offset-4">entre na sua conta</a> para o enviar.
                    </p>
                  )}
                  {r.state === "queued" && !r.needsLogin && (
                    <p className="font-medium text-[#f3d29b]">
                      {net.online && flushingNow ? "A enviar ao restaurante…" : "⏳ Guardado no telemóvel — será enviado automaticamente quando houver ligação"}
                    </p>
                  )}
                  {r.state === "sent" && (
                    <p className="font-medium text-[#7fc290]">
                      ✓ Recebido pelo restaurante — Pedido {formatOrderNumber(r.number ?? 0, r.origin)}{" "}
                      {r.orderId && <a href={`/m/${token}/pedido/${r.orderId}`} className="text-gold-300 underline underline-offset-4">ver estado</a>}
                    </p>
                  )}
                  {r.state === "rejected" && (
                    <p className="font-medium text-[#f0b2a8]">✕ Não foi aceite: {r.message}</p>
                  )}
                  <p className="mt-1 text-mist">
                    {r.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")} · {r.state === "sent" ? "" : "estimado "}{formatXOF(r.estTotal)}
                  </p>
                  {r.state === "rejected" && (
                    <button onClick={() => removeRecord(r.key)} className="mt-2 text-xs text-mist underline underline-offset-4 hover:text-white">Remover da lista</button>
                  )}
                </li>
              ))}
            </ul>
            {queuedCount > 0 && <p className="mt-3 text-xs text-mist">Se um pedido continuar por enviar durante muito tempo, avise um empregado.</p>}
          </section>
        )}

        {categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-36 pt-10" aria-labelledby={`h-${c.id}`}>
            <h2 id={`h-${c.id}`} className="font-display text-2xl text-white">{c.label}</h2>
            <ul className="mt-4 space-y-4">
              {c.items.map((it) => {
                const q = qtyOf(it.id);
                const available = it.available && !gone.has(it.id);
                return (
                  <li key={it.id} className={`overflow-hidden rounded-2xl border bg-kau-900 ${q ? "border-gold/60" : "border-kau-800"} ${available ? "" : "opacity-60"}`}>
                    {it.imageUrl && (
                      <figure className="relative">
                        {imagesOn ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.imageUrl} alt={it.name} loading="lazy" decoding="async" fetchPriority="low" className="aspect-[16/10] w-full object-cover" />
                        ) : (
                          <div aria-hidden className="aspect-[16/10] w-full bg-kau-800/40" />
                        )}
                        {isIllustrative(it.imageUrl) && (
                          <figcaption data-testid="illustrative" className="absolute bottom-2 left-2 rounded-full bg-kau-950/75 px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm">Imagem ilustrativa</figcaption>
                        )}
                      </figure>
                    )}
                    <div className="flex items-start gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        {it.isDemo && (
                          <span className="mb-2 inline-flex rounded-full border border-dashed border-gold-300/70 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-gold-300">Demonstração</span>
                        )}
                        <h3 className="font-display text-xl text-white">{it.name}</h3>
                        {it.description && <p className="mt-1 text-sm leading-relaxed text-mist">{it.description}</p>}
                        <p className="mt-2 font-display text-lg text-gold-300">{formatXOF(it.price)}</p>
                      </div>
                      <div className="shrink-0 pt-1">
                        {!available ? (
                          <span className="rounded-full bg-kau-800 px-3 py-1.5 text-xs uppercase tracking-wider text-mist">Indisponível</span>
                        ) : q === 0 ? (
                          <button
                            onClick={() => cart.add(it)}
                            className="h-11 rounded-full bg-gold px-5 text-sm font-medium text-kau-950 transition-transform active:scale-95"
                            aria-label={`Adicionar ${it.name}`}
                          >
                            Adicionar
                          </button>
                        ) : (
                          <Stepper qty={q} name={it.name} onChange={(n) => cart.setQty(it.id, n)} />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
      </div>

      {/* Barra do carrinho */}
      {cart.count > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-kau-800 bg-kau-950/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <button
            onClick={() => setOpen(true)}
            className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between rounded-full bg-gold px-6 font-medium text-kau-950 transition-transform active:scale-[0.98]"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-kau-950 px-2 text-sm text-gold-300">{cart.count}</span>
              Ver pedido
            </span>
            <span>{formatXOF(cart.total)}</span>
          </button>
        </div>
      )}

      {/* Carrinho */}
      {open && (
        <div role="dialog" aria-modal="true" aria-label="O seu pedido" className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="mx-auto flex max-h-[92svh] w-full max-w-3xl flex-col rounded-t-[1.75rem] border border-kau-800 bg-kau-950">
            <div className="flex items-center justify-between border-b border-kau-800 px-5 py-4">
              <div>
                <h2 className="font-display text-2xl text-white">O seu pedido</h2>
                <p className="text-sm text-mist">{table.label}</p>
              </div>
              <button onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-full text-mist hover:text-white" aria-label="Fechar">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5">
              {gate ? (
                <div className="py-4"><AccountGate token={token} online={net.online} /></div>
              ) : cart.lines.length === 0 ? (
                <div className="py-16 text-center">
                  <DiamondMark className="mx-auto text-gold" />
                  <p className="mt-4 text-mist">O pedido está vazio.</p>
                </div>
              ) : (
                <ul className="divide-y divide-kau-800">
                  {cart.lines.map((l) => (
                    <li key={l.itemId} className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-display text-lg text-white">{l.name}</p>
                          <p className="text-sm text-mist">{formatXOF(l.price)} × {l.qty} = <span className="text-white">{formatXOF(l.price * l.qty)}</span></p>
                        </div>
                        <Stepper qty={l.qty} name={l.name} onChange={(n) => cart.setQty(l.itemId, n)} />
                      </div>
                      <label className="mt-3 block">
                        <span className="sr-only">Observação para {l.name}</span>
                        <input
                          value={l.note}
                          onChange={(e) => cart.setNote(l.itemId, e.target.value)}
                          maxLength={200}
                          placeholder="Observação (ex.: sem picante, bem passado)"
                          className="h-11 w-full rounded-xl border border-kau-800 bg-kau-900 px-4 text-base text-white placeholder:text-mist/60 focus:border-gold-300 focus:outline-none"
                        />
                      </label>
                      <button onClick={() => cart.setQty(l.itemId, 0)} className="mt-2 text-sm text-mist underline underline-offset-4 hover:text-white">Remover</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-kau-800 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between text-mist"><dt>Subtotal</dt><dd>{formatXOF(cart.total)}</dd></div>
                <div className="flex justify-between font-display text-xl text-white"><dt>Total</dt><dd className="text-gold-300">{formatXOF(cart.total)}</dd></div>
              </dl>
              {error && <p role="alert" className="mt-3 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-[#f0b2a8]">{error}</p>}
              {canSend ? (
                <Button size="lg" className="mt-4 w-full" onClick={send} disabled={pending || cart.lines.length === 0} aria-busy={pending}>
                  {pending ? (retrying ? "A tentar de novo…" : "A enviar…") : "Confirmar e enviar pedido"}
                </Button>
              ) : !gate ? (
                <Button size="lg" className="mt-4 w-full" onClick={() => setGate(true)} disabled={cart.lines.length === 0} data-testid="gate-open">
                  Entrar ou criar conta para enviar
                </Button>
              ) : (
                <button onClick={() => setGate(false)} className="mt-4 w-full text-center text-sm text-mist underline underline-offset-4 hover:text-white">Voltar ao pedido</button>
              )}
              <p className="mt-2 text-center text-xs text-mist" data-testid="cart-payment-methods">O pagamento é feito no restaurante: {PAYMENT_ACCEPTED_TEXT}. O valor final é confirmado pelo servidor.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ qty, name, onChange }: { qty: number; name: string; onChange: (n: number) => void }) {
  const b = "grid h-11 w-11 place-items-center rounded-full border border-gold/60 text-xl text-gold-300 transition-transform active:scale-90 disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={`Quantidade de ${name}`}>
      <button className={b} onClick={() => onChange(qty - 1)} aria-label={`Menos ${name}`}>−</button>
      <span className="w-6 text-center font-display text-lg text-white" aria-live="polite">{qty}</span>
      <button className={b} onClick={() => onChange(qty + 1)} disabled={qty >= 20} aria-label={`Mais ${name}`}>+</button>
    </div>
  );
}
