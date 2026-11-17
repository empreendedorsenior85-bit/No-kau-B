"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignTableAction, createWaiterAction, renameWaiterAction, resetWaiterPasswordAction, setWaiterActiveAction, type AdminFormState,
} from "@/app/admin/actions";

export type WaiterRow = { id: string; name: string; email: string; active: boolean; tables: number; answeredToday: number };
export type TableRow = { id: number; label: string; active: boolean; waiterId: string | null };

const field = "h-11 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-base text-white focus:border-gold-300 focus:outline-none";
const Msg = ({ m }: { m: AdminFormState }) => (m.error || m.ok
  ? <p role={m.error ? "alert" : "status"} className={`text-sm ${m.error ? "text-[#e48a7d]" : "text-[#7fc290]"}`}>{m.error ?? m.ok}</p> : null);

function NewWaiter() {
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createWaiterAction, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) { form.current?.reset(); router.refresh(); } }, [state, router]);
  return (
    <form ref={form} action={action} className="grid gap-3 rounded-2xl border border-kau-800 bg-kau-900 p-4 sm:grid-cols-3" data-testid="new-waiter">
      <label className="text-sm text-mist">Nome<input name="name" required maxLength={60} className={`${field} mt-1`} placeholder="Ex.: Aissatu" /></label>
      <label className="text-sm text-mist">Email (para entrar)<input name="email" type="email" required className={`${field} mt-1`} autoComplete="off" /></label>
      <label className="text-sm text-mist">Palavra-passe (mín. 10)<input name="password" type="password" required minLength={10} className={`${field} mt-1`} autoComplete="new-password" /></label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button disabled={pending} className="h-11 rounded-full bg-gold px-6 text-sm font-medium text-kau-950 disabled:opacity-50">{pending ? "A criar…" : "Criar garçom"}</button>
        <Msg m={state} />
      </div>
    </form>
  );
}

function Waiter({ w }: { w: WaiterRow }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [msg, setMsg] = useState<AdminFormState>({});
  const [name, setName] = useState(w.name);
  const [pw, setPw] = useState("");
  const [reset, setReset] = useState(false);
  const run = (fn: () => Promise<AdminFormState>) => start(async () => { setMsg(await fn()); router.refresh(); });
  const btn = "rounded-full border border-kau-800 px-3 py-2 text-xs text-mist hover:text-white disabled:opacity-50";
  return (
    <li className={`rounded-2xl border border-kau-800 bg-kau-900 p-4 ${w.active ? "" : "opacity-60"}`} data-testid={`waiter-${w.email}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`wn-${w.id}`}>Nome</label>
        <input id={`wn-${w.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-10 min-w-0 flex-1 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white" />
        {name.trim() !== w.name && <button className="rounded-full bg-gold px-4 py-2 text-xs font-medium text-kau-950" disabled={p} onClick={() => run(() => renameWaiterAction(w.id, name))}>Guardar</button>}
      </div>
      <p className="mt-2 text-xs text-mist">{w.email} · {w.active ? "Ativo" : "Desativado"} · {w.tables} mesa(s) · {w.answeredToday} chamada(s) atendida(s) hoje</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} disabled={p} onClick={() => run(() => setWaiterActiveAction(w.id, !w.active))}>{w.active ? "Desativar" : "Ativar"}</button>
        <button className={btn} disabled={p} onClick={() => setReset((v) => !v)}>Redefinir palavra-passe</button>
      </div>
      {reset && (
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`wp-${w.id}`}>Nova palavra-passe</label>
          <input id={`wp-${w.id}`} type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={10} autoComplete="new-password" placeholder="Nova palavra-passe (mín. 10)"
            className="h-10 min-w-0 flex-1 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white" />
          <button className="rounded-full bg-gold px-4 text-sm font-medium text-kau-950 disabled:opacity-50" disabled={p || pw.length < 10}
            onClick={() => run(async () => { const r = await resetWaiterPasswordAction(w.id, pw); if (r.ok) { setPw(""); setReset(false); } return r; })}>Guardar</button>
        </div>
      )}
      <div className="mt-2"><Msg m={msg} /></div>
    </li>
  );
}

function Assignments({ tables, waiters }: { tables: TableRow[]; waiters: WaiterRow[] }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [msg, setMsg] = useState<AdminFormState>({});
  const active = waiters.filter((w) => w.active);
  return (
    <section className="space-y-3" aria-labelledby="atribuir">
      <h2 id="atribuir" className="font-display text-2xl text-white">Mesas de cada garçom</h2>
      <p className="text-sm text-mist">As chamadas de uma mesa tocam no telemóvel do garçom atribuído. Mesas sem garçom avisam toda a equipa.</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tables.filter((t) => t.active).map((t) => (
          <li key={t.id} className="rounded-2xl border border-kau-800 bg-kau-900 p-3">
            <label htmlFor={`as-${t.id}`} className="font-display text-lg text-white">{t.label}</label>
            <select id={`as-${t.id}`} data-testid={`assign-${t.id}`} value={t.waiterId ?? ""} disabled={p}
              onChange={(e) => start(async () => { setMsg(await assignTableAction(t.id, e.target.value || null)); router.refresh(); })}
              className="mt-2 h-10 w-full rounded-xl border border-kau-800 bg-kau-950 px-2 text-sm text-white disabled:opacity-50">
              <option value="">Sem garçom</option>
              {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <Msg m={msg} />
    </section>
  );
}

export function WaitersManager({ waiters, tables }: { waiters: WaiterRow[]; tables: TableRow[] }) {
  return (
    <div className="space-y-10">
      <section className="space-y-3" aria-labelledby="novo">
        <h2 id="novo" className="font-display text-2xl text-white">Novo garçom</h2>
        <NewWaiter />
      </section>
      <section className="space-y-3" aria-labelledby="lista">
        <h2 id="lista" className="font-display text-2xl text-white">Garçons ({waiters.length})</h2>
        {waiters.length === 0
          ? <p className="rounded-2xl border border-dashed border-kau-800 p-6 text-center text-sm text-mist">Ainda não há garçons. Crie o primeiro acima.</p>
          : <ul className="grid gap-3 md:grid-cols-2">{waiters.map((w) => <Waiter key={w.id} w={w} />)}</ul>}
      </section>
      <Assignments tables={tables} waiters={waiters} />
    </div>
  );
}
