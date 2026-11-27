"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkImagesAction, restoreImageAction } from "@/app/admin/actions";
import { formatXOF } from "@/lib/format";

export type ImgVersion = { id: string; version: number; source: string; status: string; path: string | null; hasOriginal: boolean; originalBytes: number | null; originalType: string | null; optimizedBytes: number | null; width: number | null; height: number | null; sha: string | null; by: string | null; at: string; retiredAt: string | null; note: string | null };
export type ImgItem = { id: number; name: string; price: number; category: string; source: "upload" | "illustrative" | "static" | "none"; src: string | null; bytes: number | null; version: number; history: ImgVersion[] };
export type ImgFailure = { id: string; itemId: number | null; name: string | null; src: string; kind: string; detail: string | null; at: string };
type Check = Awaited<ReturnType<typeof checkImagesAction>>;

const SOURCE: Record<ImgItem["source"], string> = { upload: "Foto carregada", illustrative: "Ilustrativa", static: "Ficheiro do site", none: "Sem imagem" };
const VSOURCE: Record<string, string> = { upload: "Carregada", static: "Ilustrativa", legacy: "Anterior ao histórico", restore: "Restaurada" };
const VSTATUS: Record<string, string> = { current: "Atual", replaced: "Substituída", removed: "Removida" };
const kb = (n: number | null) => (n == null ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
const when = (s: string) => new Date(s).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Bissau" });
type Filter = "todos" | "com" | "sem" | "falhas";

export function ImagesManager({ items, failures }: { items: ImgItem[]; failures: ImgFailure[] }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [check, setCheck] = useState<Check | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [filter, setFilter] = useState<Filter>("todos");
  const [open, setOpen] = useState<number | null>(null);
  const failed = useMemo(() => new Set([...failures.map((f) => f.itemId), ...(check?.failed.map((f) => f.itemId) ?? [])]), [failures, check]);
  const counts = { total: items.length, upload: items.filter((i) => i.source === "upload").length, ilus: items.filter((i) => i.source === "illustrative" || i.source === "static").length, none: items.filter((i) => i.source === "none").length };
  const shown = items.filter((i) => filter === "todos" || (filter === "com" ? i.source !== "none" : filter === "sem" ? i.source === "none" : failed.has(i.id)));
  const groups = [...new Set(shown.map((i) => i.category))].map((c) => ({ c, items: shown.filter((i) => i.category === c) }));
  const tile = "rounded-2xl border border-kau-800 bg-kau-900 p-4";

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="images-summary">
        <div className={tile}><p className="text-xs uppercase tracking-wider text-mist">Produtos</p><p className="mt-1 font-display text-2xl text-white">{counts.total}</p></div>
        <div className={tile}><p className="text-xs uppercase tracking-wider text-mist">Foto carregada</p><p className="mt-1 font-display text-2xl text-white" data-testid="count-upload">{counts.upload}</p></div>
        <div className={tile}><p className="text-xs uppercase tracking-wider text-mist">Ilustrativa</p><p className="mt-1 font-display text-2xl text-white" data-testid="count-illustrative">{counts.ilus}</p></div>
        <div className={tile}><p className="text-xs uppercase tracking-wider text-mist">Sem imagem</p><p className="mt-1 font-display text-2xl text-white" data-testid="count-none">{counts.none}</p></div>
        <div className={tile}><p className="text-xs uppercase tracking-wider text-mist">Falhas (7 dias)</p><p className={`mt-1 font-display text-2xl ${failures.length ? "text-[#e48a7d]" : "text-[#7fc290]"}`} data-testid="count-failures">{failures.length}</p></div>
      </section>

      <section className="rounded-2xl border border-gold/40 bg-gold/5 p-5" data-testid="images-check">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-white">Verificação</h2>
            <p className="mt-1 text-sm text-mist">Confirma que cada imagem existe e abre corretamente. As falhas também são registadas quando uma imagem não carrega no telemóvel de um cliente.</p>
          </div>
          <button disabled={p} onClick={() => start(async () => { setCheck(await checkImagesAction()); router.refresh(); })}
            className="h-11 rounded-full bg-gold px-5 text-sm font-medium text-kau-950 disabled:opacity-50">{p ? "A verificar…" : "Verificar todas as imagens agora"}</button>
        </div>
        {check && (
          <div className="mt-4 text-sm" data-testid="check-result" role="status">
            {check.failed.length === 0
              ? <p className="text-[#7fc290]">✓ {check.checked} imagens verificadas — todas OK ({when(check.at)}).</p>
              : <><p className="text-[#e48a7d]">✕ {check.failed.length} de {check.checked} imagens com problema:</p>
                  <ul className="mt-2 space-y-1">{check.failed.map((f) => <li key={f.itemId} className="text-mist"><span className="text-white">{f.name}</span> ({f.category}) — {f.problem} · <code className="text-xs">{f.src}</code></li>)}</ul></>}
          </div>
        )}
        {failures.length > 0 && (
          <details className="mt-4 text-sm" data-testid="failures-list">
            <summary className="cursor-pointer text-gold-300">Falhas registadas nos últimos 7 dias ({failures.length})</summary>
            <ul className="mt-2 space-y-1">{failures.map((f) => <li key={f.id} className="text-mist">{when(f.at)} · <span className="text-white">{f.name ?? `produto ${f.itemId}`}</span> · {f.kind === "client_load" ? "não carregou no telemóvel de um cliente" : f.detail} · <code className="text-xs">{f.src}</code></li>)}</ul>
          </details>
        )}
      </section>

      {msg.ok && <p role="status" className="rounded-xl border border-[#7fc290]/40 bg-[#7fc290]/10 px-4 py-3 text-sm text-[#a9dbb4]">{msg.ok}</p>}
      {msg.error && <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-[#f0b2a8]">{msg.error}</p>}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar produtos">
        {([["todos", "Todos"], ["com", "Com imagem"], ["sem", "Sem imagem"], ["falhas", "Com falhas"]] as [Filter, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-full px-4 py-2 text-sm ${filter === k ? "bg-gold text-kau-950" : "bg-kau-900 text-mist"}`}>{l}</button>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g.c}>
          <h2 className="mb-3 font-display text-xl text-white">{g.c}</h2>
          <ul className="space-y-3">
            {g.items.map((it) => (
              <li key={it.id} data-testid={`img-item-${it.id}`} data-source={it.source} className={`rounded-2xl border bg-kau-900 p-3 ${failed.has(it.id) ? "border-[#e48a7d]/60" : "border-kau-800"}`}>
                <div className="flex items-center gap-4">
                  {it.src
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.src} alt={it.name} loading="lazy" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
                    : <div aria-hidden className="grid h-16 w-24 shrink-0 place-items-center rounded-xl border border-dashed border-kau-800 text-xs text-mist">sem foto</div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{it.name}</p>
                    <p className="text-xs text-mist">{formatXOF(it.price)} · <span data-testid="img-source">{SOURCE[it.source]}</span>{it.source === "upload" ? ` · ${kb(it.bytes)} · versão ${it.version}` : ""}{failed.has(it.id) ? " · " : ""}{failed.has(it.id) && <span className="text-[#e48a7d]">falha</span>}</p>
                  </div>
                  {it.history.length > 0 && (
                    <button onClick={() => setOpen(open === it.id ? null : it.id)} aria-expanded={open === it.id} className="shrink-0 rounded-full border border-kau-800 px-3 py-1.5 text-xs text-mist hover:text-white">
                      Histórico ({it.history.length})
                    </button>
                  )}
                </div>
                {open === it.id && (
                  <ul className="mt-3 space-y-2 border-t border-kau-800 pt-3" data-testid={`history-${it.id}`}>
                    {it.history.map((v) => (
                      <li key={v.id} data-testid="history-row" data-status={v.status} className="flex flex-wrap items-center gap-3 text-xs text-mist">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/admin/menu-image-history/${v.id}`} alt="" loading="lazy" className="h-12 w-16 rounded-lg object-cover" />
                        <span className={v.status === "current" ? "text-[#7fc290]" : ""}>{VSTATUS[v.status] ?? v.status}</span>
                        <span>{VSOURCE[v.source] ?? v.source}</span>
                        <span>{when(v.at)}{v.by ? ` · ${v.by}` : ""}</span>
                        {v.optimizedBytes != null && <span>otimizada {kb(v.optimizedBytes)}{v.width ? ` · ${v.width}×${v.height}` : ""}</span>}
                        <span data-testid="original-state">{v.hasOriginal ? <>original {kb(v.originalBytes)} · <a href={`/api/admin/menu-image-history/${v.id}?f=original`} className="text-gold-300 underline underline-offset-2">descarregar</a></> : v.path ? "ficheiro do site" : "original não guardado (anterior ao histórico)"}</span>
                        {v.sha && <code title="SHA-256 (início)">#{v.sha}</code>}
                        {v.status !== "current" && (
                          <button disabled={p} onClick={() => { if (confirm(`Restaurar esta versão em "${it.name}"? A imagem atual fica guardada no histórico.`)) start(async () => { setMsg(await restoreImageAction(v.id)); router.refresh(); }); }}
                            className="rounded-full bg-gold px-3 py-1 font-medium text-kau-950 disabled:opacity-50">Restaurar</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
