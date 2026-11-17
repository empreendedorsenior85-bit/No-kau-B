"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import { clientLoginAction, registerAction, type ClientFormState } from "@/app/cliente/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/forms/Field";

/** Envio manual: depois de um erro os campos digitados mantêm-se. */
function submitWith(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); };
}

export function RegisterForm({ volta }: { volta: string }) {
  const [s, action, pending] = useActionState<ClientFormState, FormData>(registerAction, {});
  return (
    <form action={action} onSubmit={submitWith(action)} className="space-y-5" data-testid="register-form">
      <input type="hidden" name="volta" value={volta} />
      <Input label="Nome" name="name" autoComplete="name" required minLength={2} maxLength={80} defaultValue={s.values?.name} />
      <Input label="Email" name="email" type="email" autoComplete="email" required defaultValue={s.values?.email} />
      <Input label="Telefone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="955 000 000" required defaultValue={s.values?.phone} hint="Número da Guiné-Bissau (9 dígitos) ou com indicativo (+…)." />
      <Input label="Palavra-passe" name="password" type="password" autoComplete="new-password" required minLength={8} hint="Pelo menos 8 caracteres." />
      <Input label="Repetir palavra-passe" name="password2" type="password" autoComplete="new-password" required minLength={8} />
      <label className="flex items-start gap-3 text-sm leading-relaxed text-mist">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-[#a9862c]" />
        <span>Aceito que o Nô Kau guarde o meu nome, email e telefone para gerir a minha conta e o histórico dos meus pedidos. Não são partilhados nem usados para publicidade.</span>
      </label>
      {s.error && <p role="alert" className="text-sm text-[#e48a7d]">{s.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "A criar conta…" : "Criar conta"}</Button>
    </form>
  );
}

export function ClientLoginForm({ volta }: { volta: string }) {
  const [s, action, pending] = useActionState<ClientFormState, FormData>(clientLoginAction, {});
  return (
    <form action={action} onSubmit={submitWith(action)} className="space-y-5" data-testid="client-login-form">
      <input type="hidden" name="volta" value={volta} />
      <Input label="Email ou telefone" name="identifier" autoComplete="username" required defaultValue={s.values?.identifier} />
      <Input label="Palavra-passe" name="password" type="password" autoComplete="current-password" required />
      {s.error && <p role="alert" className="text-sm text-[#e48a7d]">{s.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "A entrar…" : "Entrar"}</Button>
    </form>
  );
}
