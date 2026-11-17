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
  /** Pago (pagamento confirmado pelo gerente). */
  paid: boolean;
  createdAt: string;
  updatedAt: string;
  rev: number;
  items: OrderItem[];
};

export const formatOrderNumber = (n: number, origin: "central" | "local" = "central") =>
  `${origin === "local" ? "L" : "#"}${String(n).padStart(4, "0")}`;

/** Chamadas do cliente (Etapa 3). */
export type CallKind = "waiter" | "manager" | "bill";
export type CallStatus = "open" | "ack" | "done" | "cancelled";
export const CALL_LABEL: Record<CallKind, string> = { waiter: "Chamar empregado", manager: "Chamar gerente", bill: "Pedir a conta" };
export const CALL_SHORT: Record<CallKind, string> = { waiter: "Empregado", manager: "Gerente", bill: "Conta" };
export const CALL_STATUS_LABEL: Record<CallStatus, string> = { open: "À espera", ack: "A caminho", done: "Resolvida", cancelled: "Cancelada" };

export type ServiceCall = {
  id: string;
  tableId: number;
  tableNumber: number;
  tableLabel: string;
  /** Garçom atribuído à mesa no momento (para destacar "a sua mesa"). */
  waiterId: string | null;
  kind: CallKind;
  status: CallStatus;
  /** Pedir a conta: total dos pedidos da mesa desde a última conta entregue. */
  amount: number | null;
  createdAt: string;
  ackAt: string | null;
  ackBy: string | null;
  doneAt: string | null;
  doneBy: string | null;
  rev: number;
};

/** Pagamentos (Etapa 4): feitos EM MÃO no restaurante e confirmados pelo gerente. */
export type PaymentMethod = "cash" | "orange_money" | "mtn_momo" | "card" | "transfer";
export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "orange_money", "mtn_momo", "card", "transfer"];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Numerário", orange_money: "Orange Money", mtn_momo: "MTN MoMo", card: "Cartão (TPA)", transfer: "Transferência",
};

/** Reservas. */
export type ReservationStatus = "pending" | "approved" | "rejected" | "cancelled";
export const RESERVATION_LABEL: Record<ReservationStatus, string> = { pending: "Pendente", approved: "Aprovada", rejected: "Rejeitada", cancelled: "Cancelada" };
export type Reservation = {
  id: string; code: string; name: string; phone: string; email: string; date: string; time: string; guests: number; notes: string | null;
  status: ReservationStatus; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; createdAt: string; rev: number;
  hasAccount: boolean;
};
/** O que o cliente vê (sem dados internos). */
export type PublicReservation = Pick<Reservation, "code" | "name" | "date" | "time" | "guests" | "notes" | "status" | "decidedAt" | "decisionNote" | "createdAt">;
export const fmtResDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
