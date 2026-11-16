"use server";

import { headers } from "next/headers";
import { privateEventSchema, reservationSchema } from "@/lib/validation";
import { deliver } from "@/lib/delivery";
import { rateLimit } from "@/lib/rate-limit";

export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string>; values?: Record<string, string> }
  | { status: "delivered"; reference: string }
  | { status: "manual"; summary: string };

function formToObject(fd: FormData) {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

function flatten(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}

async function guard(): Promise<FormState | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  // Sem IP identificável não se aplica limite partilhado (bloquearia todos os clientes ao mesmo tempo).
  if (ip && !rateLimit(ip, 20)) { // 20/10 min por IP: operadores móveis partilham IPs entre muitos clientes
    return { status: "error", message: "Demasiados pedidos em pouco tempo. Tente novamente dentro de alguns minutos ou ligue-nos." };
  }
  return null;
}

const fmtDate = (d: string) => d.split("-").reverse().join("/");

export async function submitReservation(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = formToObject(fd);
  const parsed = reservationSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: "Verifique os campos assinalados.", fieldErrors: flatten(parsed.error.issues), values: raw };
  }
  // limite só para pedidos válidos: enganos de preenchimento não bloqueiam o cliente
  const blocked = await guard();
  if (blocked) return { ...blocked, values: raw } as FormState;
  const r = parsed.data;
  if (r.website) return { status: "manual", summary: "" }; // honeypot: resposta neutra

  const result = await deliver("reservation", r);
  if (result.status === "delivered") return { status: "delivered", reference: result.reference };

  const summary =
    `Pedido de reserva — Nô Kau\n` +
    `Nome: ${r.name}\nTelefone: ${r.phone}\n` +
    (r.email ? `Email: ${r.email}\n` : "") +
    `Data: ${fmtDate(r.date)} às ${r.time}\nPessoas: ${r.guests}\n` +
    (r.notes ? `Observações: ${r.notes}` : "");
  return { status: "manual", summary: summary.trim() };
}

const eventLabels: Record<string, string> = {
  aniversario: "Aniversário",
  "jantar-privado": "Jantar privado",
  familia: "Encontro familiar",
  empresa: "Evento de empresa",
  outro: "Outro",
};

export async function submitPrivateEvent(_prev: FormState, fd: FormData): Promise<FormState> {
  const raw = formToObject(fd);
  const parsed = privateEventSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: "Verifique os campos assinalados.", fieldErrors: flatten(parsed.error.issues), values: raw };
  }
  const blocked = await guard();
  if (blocked) return { ...blocked, values: raw } as FormState;
  const e = parsed.data;
  if (e.website) return { status: "manual", summary: "" };

  const result = await deliver("private_event", e);
  if (result.status === "delivered") return { status: "delivered", reference: result.reference };

  const summary =
    `Pedido de evento privado — Nô Kau\n` +
    `Tipo: ${eventLabels[e.eventType]}\nNome: ${e.name}\nTelefone: ${e.phone}\n` +
    (e.email ? `Email: ${e.email}\n` : "") +
    `Data: ${fmtDate(e.date)}\nPessoas: ${e.guests}\n` +
    (e.notes ? `Detalhes: ${e.notes}` : "");
  return { status: "manual", summary: summary.trim() };
}
