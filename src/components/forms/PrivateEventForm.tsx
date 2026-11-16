"use client";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { submitPrivateEvent, type FormState } from "@/app/actions";
import { Honeypot, Input, Select, Textarea } from "./Field";
import { FormResult } from "./FormResult";
import { Button } from "@/components/ui/Button";
import { todayISO, useClientValue } from "@/lib/use-client-value";

const initial: FormState = { status: "idle" };

export function PrivateEventForm() {
  const [key, setKey] = useState(0);
  return <Inner key={key} onReset={() => setKey((k) => k + 1)} />;
}

function Inner({ onReset }: { onReset: () => void }) {
  const [state, action, pending] = useActionState(submitPrivateEvent, initial);
  const today = useClientValue(todayISO) ?? undefined;
  if (state.status === "delivered" || state.status === "manual") {
    return <FormResult state={state} onReset={onReset} kind="evento" />;
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
      <Select label="Tipo de evento" name="eventType" required defaultValue={v.eventType ?? ""} error={err.eventType}>
        <option value="" disabled>Escolha…</option>
        <option value="aniversario">Aniversário</option>
        <option value="jantar-privado">Jantar privado</option>
        <option value="familia">Encontro familiar</option>
        <option value="empresa">Evento de empresa</option>
        <option value="outro">Outro</option>
      </Select>
      <Input label="Nome completo" name="name" autoComplete="name" required defaultValue={v.name} error={err.name} />
      <Input label="Telefone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+245 …" required defaultValue={v.phone} error={err.phone} />
      <Input label="Email" name="email" type="email" autoComplete="email" optional defaultValue={v.email} error={err.email} />
      <Input label="Data pretendida" name="date" type="date" min={today} required defaultValue={v.date} error={err.date} />
      <Input label="Número de convidados" name="guests" type="number" inputMode="numeric" min={2} max={300} required defaultValue={v.guests ?? "10"} error={err.guests} />
      <div className="sm:col-span-2">
        <Textarea label="Conte-nos sobre o evento" name="notes" optional maxLength={600} placeholder="Horário, menu, música, decoração…" defaultValue={v.notes} error={err.notes} />
      </div>
      <div className="sm:col-span-2 sm:text-right">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? "A validar…" : "Pedir proposta"}
        </Button>
      </div>
    </form>
  );
}
