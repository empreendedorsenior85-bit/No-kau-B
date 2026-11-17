import { z } from "zod";

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s.-]/g, ""))
  .refine((v) => /^\+?\d{7,15}$/.test(v), "Indique um número de telefone válido (ex.: +245 955 000 000).");

const email = z
  .string()
  .trim()
  .max(160)
  .refine((v) => v === "" || z.email().safeParse(v).success, "Email inválido.")
  .optional();

/** Data local em Bissau (GMT+0, sem horário de verão). */
function todayBissau() {
  return new Date().toISOString().slice(0, 10);
}

const base = {
  name: z.string().trim().min(2, "Indique o seu nome.").max(80, "Nome demasiado longo."),
  phone,
  email,
  notes: z.string().trim().max(600, "Máximo de 600 caracteres.").optional(),
  // honeypot: campo invisível — bots preenchem, pessoas não
  website: z.string().max(0).optional(),
};

export const reservationSchema = z.object({
  ...base,
  // reservas: o email é obrigatório (identifica o pedido e permite contactar o cliente)
  email: z.string().trim().max(160).refine((v) => z.email().safeParse(v).success, "Indique um email válido."),
  key: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha uma data.")
    .refine((d) => d >= todayBissau(), "A data não pode estar no passado."),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Escolha um horário."),
  guests: z.coerce.number().int("Número inválido.").min(1, "Mínimo 1 pessoa.").max(30, "Para mais de 30 pessoas, use o pedido de evento privado."),
});

export const privateEventSchema = z.object({
  ...base,
  eventType: z.enum(["aniversario", "jantar-privado", "familia", "empresa", "outro"], { message: "Escolha o tipo de evento." }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha uma data.")
    .refine((d) => d >= todayBissau(), "A data não pode estar no passado."),
  guests: z.coerce.number().int().min(2, "Mínimo 2 pessoas.").max(300, "Máximo 300 pessoas."),
});

export type ReservationInput = z.infer<typeof reservationSchema>;
export type PrivateEventInput = z.infer<typeof privateEventSchema>;

/** Pedido do cliente: o preço NUNCA vem do cliente — só ids e quantidades. */
export const orderSchema = z.object({
  token: z.string("QR Code inválido. Leia o QR Code da mesa outra vez.").regex(/^[A-Za-z0-9_-]{22}$/, "QR Code inválido. Leia o QR Code da mesa outra vez."),
  key: z.string("Pedido inválido. Atualize a página e tente novamente.").regex(/^[A-Za-z0-9_-]{16,64}$/, "Pedido inválido. Atualize a página e tente novamente."),
  lines: z
    .array(
      z.object({
        itemId: z.number("Produto inválido.").int("Produto inválido.").positive("Produto inválido."),
        quantity: z.number("Quantidade inválida.").int("Quantidade inválida.").min(1, "Quantidade mínima: 1.").max(20, "Máximo de 20 unidades por produto."),
        note: z.string().trim().max(200, "Observação demasiado longa (máx. 200 caracteres).").optional(),
      }),
      "O pedido está vazio.",
    )
    .min(1, "O pedido está vazio.")
    .max(30, "Máximo de 30 produtos diferentes por pedido. Envie em dois pedidos."),
});
