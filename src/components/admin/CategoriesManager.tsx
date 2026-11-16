"use client";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCategoryAction, deleteCategoryAction, moveCategoryAction, setCategoryActiveAction, updateCategoryAction, type AdminFormState,
} from "@/app/admin/actions";

export type CategoryRow = { id: string; label: string; description: string; active: boolean; count: number };
const input = "h-10 min-w-0 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white focus:border-gold-300 focus:outline-none";

function Row({ c, i, last }: { c: CategoryRow; i: number; last: boolean }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [label, setLabel] = useState(c.label);
  const [desc, setDesc] = useState(c.description);
  const [msg, setMsg] = useState<AdminFormState>({});
  const [active, setActive] = useOptimistic(c.active, (_: boolean, v: boolean) => v); // resposta imediata no ecrã
  const run = (fn: () => Promise<AdminFormState>) => start(async () => { setMsg(await fn()); router.refresh(); });
  const btn = "grid h-9 w-9 place-items-center rounded-full border border-kau-800 text-mist hover:text-white disabled:opacity-30";
  const dirty = label !== c.label || desc !== c.description;
  return (
    <li className={`rounded-2xl border border-kau-800 bg-kau-900 p-3 ${active ? "" : "opacity-60"}`} data-testid={`cat-${c.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} disabled={p || i === 0} onClick={() => run(() => moveCategoryAction(c.id, "up"))} aria-label={`Subir ${c.label}`}>↑</button>
        <button className={btn} disabled={p || last} onClick={() => run(() => moveCategoryAction(c.id, "down"))} aria-label={`Descer ${c.label}`}>↓</button>
        <label className="sr-only" htmlFor={`cl-${c.id}`}>Nome</label>
        <input id={`cl-${c.id}`} className={`${input} w-44 flex-1`} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        <label className="sr-only" htmlFor={`cd-${c.id}`}>Descrição</label>
        <input id={`cd-${c.id}`} className={`${input} hidden flex-[2] md:block`} value={desc} maxLength={120} placeholder="Descrição curta (opcional)" onChange={(e) => setDesc(e.target.value)} />
        <span className="text-xs text-mist">{c.count} {c.count === 1 ? "produto" : "produtos"}</span>
        <button disabled={p || !dirty || !label.trim()} onClick={() => run(() => updateCategoryAction(c.id, label, desc))} className="rounded-full bg-gold px-4 py-2 text-xs font-medium text-kau-950 disabled:opacity-30">Guardar</button>
        <label className="flex items-center gap-2 text-xs text-mist"><input type="checkbox" checked={active} disabled={p} onChange={(e) => { const v = e.target.checked; start(async () => { setActive(v); setMsg(await setCategoryActiveAction(c.id, v)); router.refresh(); }); }} className="h-4 w-4 accent-[#a9862c]" />Visível</label>
        {c.count === 0 && <button disabled={p} onClick={() => { if (confirm(`Eliminar a categoria “${c.label}”?`)) run(() => deleteCategoryAction(c.id)); }} className="text-xs text-mist underline underline-offset-4 hover:text-white">Eliminar</button>}
      </div>
      {(msg.error || msg.ok) && <p role={msg.error ? "alert" : "status"} className={`mt-2 text-xs ${msg.error ? "text-[#e48a7d]" : "text-[#7fc290]"}`}>{msg.error ?? msg.ok}</p>}
    </li>
  );
}

export function CategoriesManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createCategoryAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) { ref.current?.reset(); router.refresh(); } }, [state, router]);
  return (
    <section className="rounded-2xl border border-kau-800 bg-kau-900/40 p-5" aria-label="Categorias">
      <h2 className="font-display text-xl text-white">Categorias</h2>
      <p className="mt-1 text-sm text-mist">Organizam o menu dos clientes pela ordem abaixo. Categorias escondidas não aparecem nos QR Codes.</p>
      <ul className="mt-4 space-y-2">{categories.map((c, i) => <Row key={c.id} c={c} i={i} last={i === categories.length - 1} />)}</ul>
      <form ref={ref} action={action} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-sm text-mist">Nova categoria<input name="label" required maxLength={60} className={`${input} mt-1 block w-56`} /></label>
        <label className="text-sm text-mist">Descrição (opcional)<input name="description" maxLength={120} className={`${input} mt-1 block w-64`} /></label>
        <button disabled={pending} className="h-10 rounded-full bg-gold px-5 text-sm font-medium text-kau-950 disabled:opacity-50">{pending ? "A criar…" : "Adicionar categoria"}</button>
        {state.error && <p role="alert" className="w-full text-sm text-[#e48a7d]">{state.error}</p>}
        {state.ok && <p role="status" className="w-full text-sm text-[#7fc290]">{state.ok}</p>}
      </form>
    </section>
  );
}
