"use client";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { submitReservation, type FormState } from "@/app/actions";
import { Honeypot, Input, Textarea } from "./Field";
import { FormResult } from "./FormResult";
import { Button } from "@/components/ui/Button";
import { todayISO, useClientValue } from "@/lib/use-client-value";

const initial: FormState = { status: "idle" };

export function ReservationForm() {
  const [key, setKey] = useState(0);
  return <Inner key={key} onReset={() => setKey((k) => k + 1)} />;
}

function Inner({ onReset }: { onReset: () => void }) {
  const [state, action, pending] = useActionState(submitReservation, initial);
  const today = useClientValue(todayISO) ?? undefined;

  if (state.status === "delivered" || state.status === "manual") {
    return <FormResult state={state} onReset={onReset} kind="reserva" />;
  }
  /**
   * Envio manual: impede o "reset" automático do React 19 após a ação, que apagava
   * campos já preenchidos depois de um erro de validação (condição de corrida).
   * Sem JS, o atributo `action` mantém o envio nativo (progressive enhancement).
   */
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
  const err = state.status === "error" ? state.fieldErrors ?? {} : {};
  const v = state.status === "error" ? state.values ?? {} : {};

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="relative grid gap-5 sm:grid-cols-2">
      <Honeypot />
      {state.status === "error" && (
        <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-[#f0b2a8] sm:col-span-2">
          {state.message}
        </p>
      )}
      <div className="sm:col-span-2">
        <Input label="Nome completo" name="name" autoComplete="name" required defaultValue={v.name} error={err.name} />
      </div>
      <Input label="Telefone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+245 …" required defaultValue={v.phone} error={err.phone} />
      <Input label="Email" name="email" type="email" autoComplete="email" optional defaultValue={v.email} error={err.email} />
      <Input label="Data" name="date" type="date" min={today} required defaultValue={v.date} error={err.date} />
      <Input label="Hora" name="time" type="time" step={900} required defaultValue={v.time} error={err.time} hint="Horário de funcionamento a confirmar pelo restaurante." />
      <Input label="Número de pessoas" name="guests" type="number" inputMode="numeric" min={1} max={30} required defaultValue={v.guests ?? "2"} error={err.guests} />
      <div className="sm:col-span-2">
        <Textarea label="Observações especiais" name="notes" optional maxLength={600} placeholder="Aniversário, alergias, cadeira de bebé…" defaultValue={v.notes} error={err.notes} />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-mist">A reserva só fica confirmada depois da resposta do restaurante.</p>
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? "A validar…" : "Pedir reserva"}
        </Button>
      </div>
    </form>
  );
}
