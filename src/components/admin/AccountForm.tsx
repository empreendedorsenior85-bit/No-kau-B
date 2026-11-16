"use client";
import { useActionState } from "react";
import { changeOwnPasswordAction, type AdminFormState } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/forms/Field";

export function AccountForm() {
  const [s, action, pending] = useActionState<AdminFormState, FormData>(changeOwnPasswordAction, {});
  return (
    <form action={action} className="max-w-md space-y-5">
      <Input label="Palavra-passe atual" name="current" type="password" autoComplete="current-password" required />
      <Input label="Nova palavra-passe (mín. 10 caracteres)" name="next" type="password" autoComplete="new-password" minLength={10} required />
      {s.error && <p role="alert" className="text-sm text-[#e48a7d]">{s.error}</p>}
      {s.ok && <p role="status" className="text-sm text-[#7fc290]">{s.ok}</p>}
      <Button type="submit" disabled={pending}>{pending ? "A guardar…" : "Alterar palavra-passe"}</Button>
    </form>
  );
}
