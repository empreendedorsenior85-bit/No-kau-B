"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import { loginAction, setupAction, type AdminFormState } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/forms/Field";

/** Envio manual: evita que o React 19 apague os campos depois de um erro (o email digitado mantém-se). */
function submitWith(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

export function LoginForm() {
  const [s, action, pending] = useActionState<AdminFormState, FormData>(loginAction, {});
  return (
    <form action={action} onSubmit={submitWith(action)} className="space-y-5">
      <Input label="Email" name="email" type="email" autoComplete="username" required />
      <Input label="Palavra-passe" name="password" type="password" autoComplete="current-password" required />
      {s.error && <p role="alert" className="text-sm text-[#e48a7d]">{s.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "A entrar…" : "Entrar"}</Button>
    </form>
  );
}

export function SetupForm() {
  const [s, action, pending] = useActionState<AdminFormState, FormData>(setupAction, {});
  return (
    <form action={action} onSubmit={submitWith(action)} className="space-y-5">
      <Input label="Código de configuração" name="token" type="password" autoComplete="off" required hint="O código SETUP_TOKEN definido no servidor." />
      <Input label="Email do administrador" name="email" type="email" autoComplete="username" required />
      <Input label="Palavra-passe (mín. 10 caracteres)" name="password" type="password" autoComplete="new-password" minLength={10} required />
      {s.error && <p role="alert" className="text-sm text-[#e48a7d]">{s.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "A configurar…" : "Criar conta de administrador"}</Button>
    </form>
  );
}
