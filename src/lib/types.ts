/** Tipos partilhados entre servidor e cliente (sem imports de servidor). */
export type OrderStatus = "pending" | "preparing" | "done";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pendente",
  preparing: "Em preparação",
  done: "Concluído",
};

/** Texto para o cliente (perspetiva de quem pediu). */
export const STATUS_CLIENT: Record<OrderStatus, { title: string; hint: string }> = {
  pending: { title: "Recebido pelo restaurante", hint: "O seu pedido está na fila e será preparado em breve." },
  preparing: { title: "Em preparação", hint: "A cozinha começou a preparar o seu pedido." },
  done: { title: "Pedido pronto", hint: "O seu pedido está concluído. Bom apetite!" },
};

export const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = { pending: "preparing", preparing: "done", done: null };
export const PREV_STATUS: Record<OrderStatus, OrderStatus | null> = { pending: null, preparing: "pending", done: "preparing" };

export type OrderItem = { name: string; quantity: number; unitPrice: number; note: string | null };

export type Order = {
  id: string;
  number: number;
  /** 'local' = criado no servidor do restaurante (numeração L0001…), 'central' = site na internet. */
  origin: "central" | "local";
  tableId: number;
  tableLabel: string;
  status: OrderStatus;
  total: number;
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
  rev: number;
  items: OrderItem[];
};

export const formatOrderNumber = (n: number, origin: "central" | "local" = "central") =>
  `${origin === "local" ? "L" : "#"}${String(n).padStart(4, "0")}`;
