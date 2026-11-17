/**
 * Perfis (partilhado servidor/cliente).
 *  - Admin: tudo.
 *  - Gerente: operação e gestão (pedidos, mesas, menu, relatórios, garçons).
 *  - Garçom: atendimento (mesas, chamadas, pedidos). Sem faturação, menu, relatórios nem utilizadores.
 */
export type Role = "admin" | "gerente" | "garcom";
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", gerente: "Gerente", garcom: "Garçom" };
export const isManagerRole = (r: Role) => r === "admin" || r === "gerente";
