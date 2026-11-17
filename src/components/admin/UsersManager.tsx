"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createUserAction, resetUserPasswordAction, setUserActiveAction, setUserRoleAction, type AdminFormState,
} from "@/app/admin/actions";
import { ROLE_LABEL, type Role } from "@/lib/auth-types";

export type UserRow = { id: string; email: string; role: Role; active: boolean; createdAt: string };

const field = "mt-1 h-11 w-full rounded-xl border border-kau-800 bg-kau-950 px-3 text-base text-white focus:border-gold-300 focus:outline-none";

function CreateUser() {
  const router = useRouter();
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createUserAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) { ref.current?.reset(); router.refresh(); } }, [state, router]);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-mist">Email<input name="email" type="email" required autoComplete="off" className={field} /></label>
      <label className="text-sm text-mist">Perfil
        <select name="role" required defaultValue="gerente" className={field}>
          <option value="garcom">Garçom — atendimento: mesas, chamadas e pedidos</option>
          <option value="gerente">Gerente — pedidos, mesas, menu e garçons</option>
          <option value="admin">Admin — tudo, incluindo QR Codes e utilizadores</option>
        </select>
      </label>
      <label className="text-sm text-mist sm:col-span-2">Palavra-passe inicial (mín. 10 caracteres)
        <input name="password" type="password" required minLength={10} autoComplete="new-password" className={field} />
      </label>
      {state.error && <p role="alert" className="text-sm text-[#e48a7d] sm:col-span-2">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-[#7fc290] sm:col-span-2">{state.ok}</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="h-11 rounded-full bg-gold px-6 text-sm font-medium text-kau-950 disabled:opacity-50">{pending ? "A criar…" : "Criar utilizador"}</button></div>
    </form>
  );
}

function Row({ u, me }: { u: UserRow; me: boolean }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [msg, setMsg] = useState<AdminFormState>({});
  const [reset, setReset] = useState(false);
  const [pw, setPw] = useState("");
  const run = (fn: () => Promise<AdminFormState>) => start(async () => { setMsg(await fn()); router.refresh(); });
  const btn = "rounded-full border border-kau-800 px-3 py-2 text-xs text-mist hover:text-white disabled:opacity-50";
  return (
    <li className={`rounded-2xl border border-kau-800 bg-kau-900 p-4 ${u.active ? "" : "opacity-60"}`} data-testid={`user-${u.email}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-white">{u.email} {me && <span className="ml-1 text-xs text-gold-300">(você)</span>}</p>
          <p className="text-xs text-mist">Criado em {new Date(u.createdAt).toLocaleDateString("pt-PT")} · {u.active ? "Ativo" : "Desativado"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-wider ring-1 ${u.role === "admin" ? "bg-gold/15 text-gold-300 ring-gold/50" : "bg-white/5 text-mist ring-white/15"}`}>{ROLE_LABEL[u.role]}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`role-${u.id}`}>Perfil de {u.email}</label>
        <select id={`role-${u.id}`} value={u.role} disabled={p || me} onChange={(e) => run(() => setUserRoleAction(u.id, e.target.value as Role))}
          className="h-10 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white disabled:opacity-50">
          <option value="garcom">Garçom</option>
          <option value="gerente">Gerente</option>
          <option value="admin">Admin</option>
        </select>
        {!me && <button className={btn} disabled={p} onClick={() => run(() => setUserActiveAction(u.id, !u.active))}>{u.active ? "Desativar" : "Ativar"}</button>}
        <button className={btn} disabled={p} onClick={() => setReset((v) => !v)}>Redefinir palavra-passe</button>
      </div>
      {reset && (
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`pw-${u.id}`}>Nova palavra-passe</label>
          <input id={`pw-${u.id}`} type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={10} autoComplete="new-password" placeholder="Nova palavra-passe (mín. 10)"
            className="h-10 min-w-0 flex-1 rounded-xl border border-kau-800 bg-kau-950 px-3 text-sm text-white" />
          <button className="rounded-full bg-gold px-4 text-sm font-medium text-kau-950 disabled:opacity-50" disabled={p || pw.length < 10}
            onClick={() => run(async () => { const r = await resetUserPasswordAction(u.id, pw); if (r.ok) { setPw(""); setReset(false); } return r; })}>Guardar</button>
        </div>
      )}
      {(msg.error || msg.ok) && <p role={msg.error ? "alert" : "status"} className={`mt-2 text-sm ${msg.error ? "text-[#e48a7d]" : "text-[#7fc290]"}`}>{msg.error ?? msg.ok}</p>}
    </li>
  );
}

export function UsersManager({ users, meId }: { users: UserRow[]; meId: string }) {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-kau-800 bg-kau-900 p-5">
        <h2 className="font-display text-xl text-white">Novo utilizador</h2>
        <div className="mt-4"><CreateUser /></div>
      </section>
      <section>
        <h2 className="mb-3 font-display text-2xl text-white">Utilizadores</h2>
        <ul className="space-y-3">{users.map((u) => <Row key={u.id} u={u} me={u.id === meId} />)}</ul>
      </section>
    </div>
  );
}
