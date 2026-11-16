/** Perfis (partilhado servidor/cliente). Admin: tudo. Gerente: pedidos, mesas (consulta) e menu. */
export type Role = "admin" | "gerente";
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", gerente: "Gerente" };
