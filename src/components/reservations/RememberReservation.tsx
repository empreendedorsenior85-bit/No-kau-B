"use client";
import { useEffect } from "react";
import { remember } from "./store";

/** Na página da reserva: guarda o link no telemóvel e marca o estado atual como visto. */
export function RememberReservation({ token, code, date, status }: { token: string; code: string; date: string; status: string }) {
  useEffect(() => { remember({ token, code, date }, status); }, [token, code, date, status]);
  return null;
}

/** Na área do cliente: junta ao telemóvel as reservas da conta (ex.: novo telemóvel), sem marcar como vistas. */
export function RememberMany({ items }: { items: { token: string; code: string; date: string; status: string }[] }) {
  useEffect(() => {
    for (const i of items) remember({ token: i.token, code: i.code, date: i.date }, i.status === "pending" ? "pending" : i.status);
  }, [items]);
  return null;
}
