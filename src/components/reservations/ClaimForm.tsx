"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import { claimReservationAction, type ClaimState } from "@/app/actions";
import { Input } from "@/components/forms/Field";
import { Button } from "@/components/ui/Button";

/** Juntar a este aparelho uma reserva feita noutro: telefone + código (R-XXXXXX). Sem palavra-passe nem SMS. */
export function ClaimForm() {
  const [s, action, pending] = useActionState<ClaimState, FormData>(claimReservationAction, {});
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); };
  return (
    <form action={action} onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="claim-form">
      <Input label="Telefone usado na reserva" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="955 000 000" required defaultValue={s.values?.phone} />
      <Input label="Código da reserva" name="code" placeholder="R-AB12CD" required maxLength={9} defaultValue={s.values?.code} className="uppercase" />
      <Button type="submit" disabled={pending}>{pending ? "A procurar…" : "Juntar reserva"}</Button>
      {s.error && <p role="alert" className="text-sm text-[#e48a7d] sm:col-span-3">{s.error}</p>}
    </form>
  );
}
