import "server-only";
import { redirect } from "next/navigation";
import { customerOrders, getCustomer } from "./customers";
import { customerPayments } from "./payments";
import { customerReservations } from "./reservations";
import { getVisitor, visitorReservations } from "./visitors";
import type { PublicReservation } from "./types";

/** Sessão de cliente obrigatória: sem sessão vai para o login e volta à mesma página depois. */
export async function requireCustomer(volta: string) {
  const c = await getCustomer();
  if (!c) redirect(`/cliente/entrar?volta=${encodeURIComponent(volta)}`);
  return c;
}

/**
 * Reservas que o cliente vê na conta: as feitas com a sessão iniciada (ligadas à conta) e as feitas
 * como visitante NESTE aparelho (perfil sem palavra-passe). Sem repetidos; as próximas primeiro.
 * Nunca procura por telefone: ter o número de alguém não dá acesso às reservas dessa pessoa.
 */
export async function accountReservations(customerId: string): Promise<(PublicReservation & { token: string })[]> {
  const [own, visitor] = await Promise.all([
    customerReservations(customerId),
    getVisitor().then((v) => (v ? visitorReservations(v.id) : [])).catch(() => []),
  ]);
  const byCode = new Map<string, PublicReservation & { token: string }>();
  for (const r of [...own, ...visitor]) if (!byCode.has(r.code)) byCode.set(r.code, r);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Bissau" });
  const upcoming = (r: PublicReservation) => r.date >= today && (r.status === "pending" || r.status === "approved");
  return [...byCode.values()].sort((a, b) =>
    Number(upcoming(b)) - Number(upcoming(a))
    || (upcoming(a) ? `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) : `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)));
}

export const isUpcoming = (r: PublicReservation) => {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Bissau" });
  return r.date >= today && (r.status === "pending" || r.status === "approved");
};

export async function accountData(customerId: string) {
  const [orders, reservations, payments] = await Promise.all([customerOrders(customerId), accountReservations(customerId), customerPayments(customerId)]);
  return { orders, reservations, payments };
}
