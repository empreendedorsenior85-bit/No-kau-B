"use server";

import { MENU_IMAGE_MAX_UPLOAD, normalizeMenuImage } from "@/lib/images";
import { clearFailures, isThrottled, loginKeys, recordFailure, revokeAllSessions } from "@/lib/sessions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { query, tx } from "@/lib/db";
import {
  endOtherSessions, endSession, getManager, hashPassword, safeEqual, startSession, verifyPassword,
} from "@/lib/auth";
import { changeStatus } from "@/lib/orders";
import { setCallStatus, type CallActionResult } from "@/lib/calls";
import { decideReservation, type DecideResult } from "@/lib/reservations";
import { cancelJob, connOf, enqueueReprint, enqueueTest, isPrintAgent, retryJob, type PrinterRow } from "@/lib/print/agent";
import { probe } from "@/lib/print/transport";
import { confirmPayment, voidPayment, type ConfirmInput, type ConfirmResult } from "@/lib/payments";
import { newQrToken } from "@/lib/tokens";
import { isLocalServer } from "@/lib/node-role";
import { isManagerRole } from "@/lib/auth-types";
import { hasAdmin, initDatabase } from "@/db/init";
import { CATALOG_CATEGORIES, CATALOG_ITEMS } from "@/content/nokau-menu";
import type { Order, OrderStatus } from "@/lib/types";

export type AdminFormState = { error?: string; ok?: string };

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Toda ação administrativa verifica a sessão no servidor — nunca confia no navegador. */
async function staff() {
  const m = await getManager();
  if (!m) throw new Error("Não autorizado");
  return m;
}

/** Ações de gestão (Admin e Gerente). Um Garçom é recusado no servidor. */
async function manager() {
  const m = await staff();
  if (!isManagerRole(m.role)) throw new Error("Não autorizado");
  return m;
}

/** Ações reservadas ao Admin (mesas, QR Codes, utilizadores). Um Gerente é recusado no servidor. */
async function adminOnly() {
  const m = await manager();
  if (m.role !== "admin") throw new Error("Não autorizado");
  return m;
}

/** Registo de auditoria. Toda a alteração ao menu (menu.* / category.*) passa por aqui: invalida o menu público em cache. */
/** Servidor local: menu, mesas e utilizadores vêm do servidor central (seriam sobrescritos na sincronização). */
const LOCAL_READONLY = "No servidor local do restaurante o menu, as mesas e os utilizadores são só de leitura — altere-os no site central; chegam aqui na sincronização seguinte.";
function assertEditableHere() {
  if (isLocalServer()) throw new Error(LOCAL_READONLY);
}

const audit = async (actor: string, action: string, entity: string, id: string | number, detail?: unknown) => {
  await query("insert into audit_log (actor, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5)",
    [actor, action, entity, String(id), detail ? JSON.stringify(detail) : null]);
  if (/^(menu|category)\./.test(action)) updateTag("menu");
};

// ---------- autenticação ----------
export async function loginAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const keys = loginKeys("equipa", await clientIp(), email);
  if (await isThrottled(keys)) return { error: "Demasiadas tentativas. Aguarde 15 minutos." };
  const r = await query<{ id: string; password_hash: string; role: string }>(
    "select id, password_hash, role from admin_users where email = $1 and active", [email]);
  const ok = await verifyPassword(password, r.rows[0]?.password_hash ?? null);
  if (!ok || !r.rows[0]) {
    await recordFailure(keys);
    return { error: "Email ou palavra-passe incorretos." };
  }
  await clearFailures(keys);
  await startSession(r.rows[0].id);
  await audit(email, "login", "admin", r.rows[0].id);
  redirect(r.rows[0].role === "garcom" ? "/admin/mesas" : "/admin/dashboard"); // o garçom entra direto no atendimento
}

export async function logoutAction() {
  await endSession();
  redirect("/admin/login");
}

const setupSchema = z.object({
  token: z.string().min(1),
  email: z.email("Email inválido.").transform((v) => v.toLowerCase()),
  password: z.string().min(10, "A palavra-passe precisa de pelo menos 10 caracteres."),
});

/** Primeiro acesso: só funciona enquanto não existe nenhum gerente e com o SETUP_TOKEN do servidor. */
export async function setupAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  assertEditableHere();
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return { error: "SETUP_TOKEN não configurado no servidor." };
  const parsed = setupSchema.safeParse({ token: fd.get("token"), email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await hasAdmin()) return { error: "Já existe um gerente. Use o login." };
  // base de dados nova: o esquema (idempotente) tem de existir para registar as tentativas falhadas
  await initDatabase();
  const keys = loginKeys("setup", await clientIp(), "primeiro-acesso");
  if (await isThrottled(keys)) return { error: "Demasiadas tentativas. Aguarde 15 minutos." };
  if (!safeEqual(parsed.data.token, expected)) {
    await recordFailure(keys);
    return { error: "Código de configuração incorreto." };
  }
  if (await hasAdmin()) return { error: "Já existe um gerente. Use o login." };
  const hash = await hashPassword(parsed.data.password);
  const r = await query<{ id: string }>(
    "insert into admin_users (email, password_hash, role) values ($1,$2,'admin') returning id", [parsed.data.email, hash]);
  await startSession(r.rows[0].id);
  await audit(parsed.data.email, "setup", "admin", r.rows[0].id);
  redirect("/admin/dashboard");
}

// ---------- pedidos ----------
export async function changeStatusAction(orderId: string, from: OrderStatus, to: OrderStatus):
  Promise<{ ok: true; order: Order } | { ok: false; message: string }> {
  const m = await staff();
  if (!["pending", "preparing", "done"].includes(from) || !["pending", "preparing", "done"].includes(to)) {
    return { ok: false, message: "Estado inválido." };
  }
  return changeStatus(orderId, from, to, m.email);
}

// ---------- chamadas dos clientes (toda a equipa, incluindo Garçom) ----------
export async function setCallStatusAction(id: string, to: "ack" | "done"): Promise<CallActionResult> {
  const m = await staff();
  if (to !== "ack" && to !== "done") return { ok: false, message: "Estado inválido." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Chamada inválida." };
  return setCallStatus(id, to, m.name ?? m.email);
}

// ---------- mesas ----------
export async function addTableAction(): Promise<{ ok: boolean; message?: string }> {
  assertEditableHere();
  const m = await adminOnly();
  const r = await tx(async (c) => {
    const n = await c.query<{ n: number }>("select coalesce(max(number),0)+1 n from dining_tables");
    const num = n.rows[0].n;
    await c.query("insert into dining_tables (number, label, qr_token) values ($1,$2,$3)", [num, `Mesa ${num}`, newQrToken()]);
    return num;
  });
  await audit(m.email, "table.add", "table", r);
  return { ok: true };
}

export async function toggleTableAction(id: number, active: boolean) {
  assertEditableHere();
  const m = await adminOnly();
  await query("update dining_tables set active = $2 where id = $1", [id, active]);
  await audit(m.email, active ? "table.activate" : "table.deactivate", "table", id);
}

export async function renameTableAction(id: number, label: string) {
  assertEditableHere();
  const m = await adminOnly();
  const l = label.trim().slice(0, 40);
  if (!l) return;
  await query("update dining_tables set label = $2 where id = $1", [id, l]);
  await audit(m.email, "table.rename", "table", id, { label: l });
}

/** Gera um novo token: o QR Code antigo deixa de funcionar de imediato. */
export async function rotateTokenAction(id: number) {
  assertEditableHere();
  const m = await adminOnly();
  await query("update dining_tables set qr_token = $2, token_rotated_at = now() where id = $1", [id, newQrToken()]);
  await audit(m.email, "table.rotate_token", "table", id);
}

// ---------- menu ----------
const itemSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "Indique o nome.").max(120),
  description: z.string().trim().max(400).default(""),
  price: z.coerce.number().int("Preço inteiro em FCFA.").min(0).max(1_000_000),
  categoryId: z.string().min(1, "Escolha a categoria."),
});

export async function saveItemAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  const parsed = itemSchema.safeParse({
    id: fd.get("id") || undefined, name: fd.get("name"), description: fd.get("description") ?? "",
    price: fd.get("price"), categoryId: fd.get("categoryId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const cat = await query("select 1 from menu_categories where id = $1", [d.categoryId]);
  if (!cat.rows[0]) return { error: "Categoria inválida." };

  let img: { buf: Buffer; type: string } | null = null;
  const file = fd.get("image");
  if (file instanceof File && file.size > 0) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { error: "A foto deve ser JPG, PNG ou WebP." };
    if (file.size > MENU_IMAGE_MAX_UPLOAD) return { error: "A foto é demasiado grande (máx. 900 KB)." };
    // reduzida, sem metadados (GPS) e confirmada como imagem verdadeira
    img = await normalizeMenuImage(Buffer.from(await file.arrayBuffer()));
    if (!img) return { error: "Não foi possível ler a foto. Experimente outra imagem (JPG, PNG ou WebP)." };
  }

  if (d.id) {
    await query(
      `update menu_items set name=$2, description=$3, price=$4, category_id=$5, updated_at=now(),
         is_demo = false, review_note = null where id=$1`, [d.id, d.name, d.description, d.price, d.categoryId]);
    if (img) await query("update menu_items set image=$2, image_type=$3, image_path=null, image_version=image_version+1 where id=$1", [d.id, img.buf, img.type]);
    await audit(m.email, "menu.update", "menu_item", d.id, { price: d.price });
  } else {
    const r = await query<{ id: number }>(
      `insert into menu_items (category_id, name, description, price, image, image_type, position)
       values ($1,$2,$3,$4,$5,$6,(select coalesce(max(position),0)+1 from menu_items)) returning id`,
      [d.categoryId, d.name, d.description, d.price, img?.buf ?? null, img?.type ?? null]);
    await audit(m.email, "menu.create", "menu_item", r.rows[0].id, { price: d.price });
  }
  return { ok: "Guardado." };
}

export async function setItemFlagsAction(id: number, flags: { available?: boolean; active?: boolean }) {
  assertEditableHere();
  const m = await manager();
  if (typeof flags.available === "boolean") await query("update menu_items set available=$2, updated_at=now() where id=$1", [id, flags.available]);
  if (typeof flags.active === "boolean") await query("update menu_items set active=$2, updated_at=now() where id=$1", [id, flags.active]);
  await audit(m.email, "menu.flags", "menu_item", id, flags);
}

/** Pratos de DEMONSTRAÇÃO (marcados, preço simbólico). Pedidos com eles ficam marcados como TESTE. */
export async function seedDemoAction(): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  const n = await query<{ n: string }>("select count(*) n from menu_items where is_demo");
  if (Number(n.rows[0].n) > 0) return { error: "Os pratos de demonstração já foram carregados." };
  const demo: [string, string][] = [
    ["entradas", "Demonstração · Entrada A"], ["entradas", "Demonstração · Entrada B"],
    ["principais", "Demonstração · Prato A"], ["principais", "Demonstração · Prato B"],
    ["bebidas", "Demonstração · Bebida A"], ["bebidas", "Demonstração · Bebida B"],
  ];
  for (const [cat, name] of demo) {
    await query(
      `insert into menu_items (category_id, name, description, price, is_demo, position)
       values ($1,$2,'Produto de demonstração — substitua pelos pratos reais.',1000,true,(select coalesce(max(position),0)+1 from menu_items))`,
      [cat, name]);
  }
  await audit(m.email, "menu.seed_demo", "menu_item", "-");
  return { ok: "Pratos de demonstração carregados. Os pedidos feitos com eles aparecem como TESTE." };
}

// ---------- utilizadores (só Admin) ----------
const passwordSchema = z.string().min(10, "A palavra-passe precisa de pelo menos 10 caracteres.").max(200);
const userSchema = z.object({
  email: z.email("Email inválido.").transform((v) => v.toLowerCase()),
  role: z.enum(["admin", "gerente", "garcom"], { message: "Escolha o perfil." }),
  password: passwordSchema,
});

export async function createUserAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  assertEditableHere();
  const m = await adminOnly();
  const parsed = userSchema.safeParse({ email: fd.get("email"), role: fd.get("role"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const exists = await query("select 1 from admin_users where email = $1", [parsed.data.email]);
  if (exists.rows[0]) return { error: "Já existe um utilizador com esse email." };
  const hash = await hashPassword(parsed.data.password);
  const r = await query<{ id: string }>(
    "insert into admin_users (email, password_hash, role) values ($1,$2,$3) returning id", [parsed.data.email, hash, parsed.data.role]);
  await audit(m.email, "user.create", "admin_user", r.rows[0].id, { email: parsed.data.email, role: parsed.data.role });
  return { ok: `Utilizador ${parsed.data.email} criado como ${parsed.data.role === "admin" ? "Admin" : "Gerente"}.` };
}

/** Nunca deixa o sistema sem um Admin ativo. */
async function otherActiveAdmins(excludeId: string) {
  const r = await query<{ n: string }>("select count(*) n from admin_users where role = 'admin' and active and id <> $1", [excludeId]);
  return Number(r.rows[0].n);
}

export async function setUserRoleAction(id: string, role: "admin" | "gerente" | "garcom"): Promise<AdminFormState> {
  assertEditableHere();
  const m = await adminOnly();
  if (role !== "admin" && role !== "gerente" && role !== "garcom") return { error: "Perfil inválido." };
  if (id === m.id && role !== "admin") return { error: "Não pode retirar o seu próprio perfil de Admin." };
  const u = await query<{ role: string }>("select role from admin_users where id = $1", [id]);
  if (!u.rows[0]) return { error: "Utilizador não encontrado." };
  if (u.rows[0].role === "admin" && role !== "admin" && (await otherActiveAdmins(id)) === 0) return { error: "Tem de existir pelo menos um Admin ativo." };
  await query("update admin_users set role = $2 where id = $1", [id, role]);
  await audit(m.email, "user.role", "admin_user", id, { role });
  return { ok: "Perfil atualizado." };
}

export async function setUserActiveAction(id: string, active: boolean): Promise<AdminFormState> {
  assertEditableHere();
  const m = await adminOnly();
  if (id === m.id && !active) return { error: "Não pode desativar a sua própria conta." };
  const u = await query<{ role: string; active: boolean }>("select role, active from admin_users where id = $1", [id]);
  if (!u.rows[0]) return { error: "Utilizador não encontrado." };
  if (!active && u.rows[0].role === "admin" && u.rows[0].active && (await otherActiveAdmins(id)) === 0) return { error: "Tem de existir pelo menos um Admin ativo." };
  await query("update admin_users set active = $2 where id = $1", [id, active]);
  if (!active) await revokeAllSessions("staff", id); // reativar a conta não ressuscita sessões antigas
  await audit(m.email, active ? "user.activate" : "user.deactivate", "admin_user", id);
  return { ok: active ? "Conta ativada." : "Conta desativada. A sessão deste utilizador deixa de funcionar de imediato." };
}

export async function resetUserPasswordAction(id: string, password: string): Promise<AdminFormState> {
  assertEditableHere();
  const m = await adminOnly();
  const p = passwordSchema.safeParse(password);
  if (!p.success) return { error: p.error.issues[0].message };
  const r = await query("update admin_users set password_hash = $2 where id = $1 returning id", [id, await hashPassword(p.data)]);
  if (!r.rows[0]) return { error: "Utilizador não encontrado." };
  await revokeAllSessions("staff", id); // quem tinha a palavra-passe antiga deixa de ter acesso
  await audit(m.email, "user.password_reset", "admin_user", id);
  return { ok: "Palavra-passe redefinida." };
}

// ---------- a minha conta (qualquer perfil) ----------
export async function changeOwnPasswordAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  assertEditableHere();
  const m = await staff();
  const current = String(fd.get("current") ?? "");
  const next = passwordSchema.safeParse(fd.get("next"));
  if (!next.success) return { error: next.error.issues[0].message };
  const r = await query<{ password_hash: string }>("select password_hash from admin_users where id = $1", [m.id]);
  if (!(await verifyPassword(current, r.rows[0]?.password_hash ?? null))) return { error: "A palavra-passe atual está incorreta." };
  await query("update admin_users set password_hash = $2 where id = $1", [m.id, await hashPassword(next.data)]);
  await endOtherSessions(m.id); // as outras sessões (outros aparelhos) terminam; esta continua
  await audit(m.email, "user.password_change", "admin_user", m.id);
  return { ok: "Palavra-passe alterada. As sessões noutros aparelhos foram terminadas." };
}

// ---------- categorias do menu (Admin e Gerente) ----------
const slug = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "categoria";
const catSchema = z.object({ label: z.string().trim().min(1, "Indique o nome da categoria.").max(60, "Nome demasiado longo."), description: z.string().trim().max(120).default("") });

export async function createCategoryAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  const p = catSchema.safeParse({ label: fd.get("label"), description: fd.get("description") ?? "" });
  if (!p.success) return { error: p.error.issues[0].message };
  let id = slug(p.data.label), n = 1;
  while ((await query("select 1 from menu_categories where id = $1", [id])).rows[0]) id = `${slug(p.data.label)}-${++n}`;
  await query(
    "insert into menu_categories (id, label, description, position) values ($1,$2,$3,(select coalesce(max(position),0)+1 from menu_categories))",
    [id, p.data.label, p.data.description]);
  await audit(m.email, "category.create", "menu_category", id, { label: p.data.label });
  return { ok: `Categoria “${p.data.label}” criada.` };
}

export async function updateCategoryAction(id: string, label: string, description: string): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  const p = catSchema.safeParse({ label, description });
  if (!p.success) return { error: p.error.issues[0].message };
  const r = await query("update menu_categories set label = $2, description = $3 where id = $1 returning id", [id, p.data.label, p.data.description]);
  if (!r.rows[0]) return { error: "Categoria não encontrada." };
  await audit(m.email, "category.update", "menu_category", id, { label: p.data.label });
  return { ok: "Categoria guardada." };
}

/** Troca a posição com a categoria vizinha (as posições são renumeradas para ficarem sempre únicas). */
export async function moveCategoryAction(id: string, dir: "up" | "down"): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  await tx(async (c) => {
    const all = await c.query<{ id: string }>("select id from menu_categories order by position, id");
    const ids = all.rows.map((r) => r.id);
    const i = ids.indexOf(id), j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (let k = 0; k < ids.length; k++) await c.query("update menu_categories set position = $2 where id = $1", [ids[k], k + 1]);
  });
  await audit(m.email, "category.move", "menu_category", id, { dir });
  return {};
}

export async function setCategoryActiveAction(id: string, active: boolean): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  await query("update menu_categories set active = $2 where id = $1", [id, active]);
  await audit(m.email, "category.active", "menu_category", id, { active });
  return { ok: active ? "Categoria visível no menu." : "Categoria escondida do menu dos clientes." };
}

/** Só elimina categorias vazias; com produtos, o gerente deve escondê-la ou mover os produtos. */
export async function deleteCategoryAction(id: string): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  const n = await query<{ n: string }>("select count(*) n from menu_items where category_id = $1", [id]);
  if (Number(n.rows[0].n) > 0) return { error: "A categoria tem produtos. Mova-os para outra categoria ou esconda a categoria." };
  await query("delete from menu_categories where id = $1", [id]);
  await audit(m.email, "category.delete", "menu_category", id);
  return { ok: "Categoria eliminada." };
}

export async function removeItemImageAction(id: number): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  await query("update menu_items set image = null, image_type = null, image_path = null, image_version = image_version + 1, updated_at = now() where id = $1", [id]);
  await audit(m.email, "menu.image_remove", "menu_item", id);
  return { ok: "Fotografia removida." };
}

// ---------- importar a ementa original do Nô Kau ----------
/**
 * Importa categorias e produtos da ementa original (src/content/nokau-menu.ts). Idempotente e sem duplicados:
 * produto existente (mesma categoria e nome) fica como está — preços editados pelo gerente nunca são sobrescritos.
 * Remove os produtos de DEMONSTRAÇÃO e esconde as categorias antigas que ficaram vazias.
 */
export async function importCatalogAction(): Promise<AdminFormState> {
  assertEditableHere();
  const m = await adminOnly();
  const r = await tx(async (c) => {
    const demo = await c.query("delete from menu_items where is_demo returning id");
    for (const cat of CATALOG_CATEGORIES) {
      await c.query(
        `insert into menu_categories (id, label, description, position, active) values ($1,$2,$3,$4,true)
         on conflict (id) do update set label = excluded.label, description = excluded.description, position = excluded.position, active = true`,
        [cat.id, cat.label, cat.description, cat.position]);
    }
    let created = 0, kept = 0, images = 0;
    for (const it of CATALOG_ITEMS) {
      const ex = await c.query<{ id: number; image_path: string | null }>("select id, image_path from menu_items where category_id = $1 and name = $2", [it.cat, it.name]);
      if (ex.rows[0]) {
        kept++;
        // só liga a fotografia se o produto ainda não tiver nenhuma
        if (it.image && !ex.rows[0].image_path) { await c.query("update menu_items set image_path = $2 where id = $1 and image is null", [ex.rows[0].id, it.image]); images++; }
        continue;
      }
      await c.query(
        `insert into menu_items (category_id, name, description, price, image_path, review_note, position)
         values ($1,$2,$3,$4,$5,$6,(select coalesce(max(position),0)+1 from menu_items))`,
        [it.cat, it.name, it.desc ?? "", it.price, it.image ?? null, it.review ?? null]);
      created++;
    }
    const ids = CATALOG_CATEGORIES.map((x) => x.id);
    const hid = await c.query(
      `update menu_categories set active = false, position = position + 100
       where not (id = any($1)) and active and not exists (select 1 from menu_items i where i.category_id = menu_categories.id) returning id`, [ids]);
    return { created, kept, images, demo: demo.rowCount ?? 0, hidden: hid.rowCount ?? 0 };
  });
  await audit(m.email, "menu.import_catalog", "menu_item", "-", r);
  return { ok: `Ementa importada: ${r.created} produtos novos, ${r.kept} já existiam${r.demo ? `, ${r.demo} de demonstração removidos` : ""}${r.images ? `, ${r.images} fotografias ligadas` : ""}.` };
}

// ---------- garçons e atribuição de mesas (Admin e Gerente) ----------
const waiterSchema = z.object({
  name: z.string().trim().min(1, "Indique o nome do garçom.").max(60, "Nome demasiado longo."),
  email: z.email("Email inválido.").transform((v) => v.toLowerCase()),
  password: passwordSchema,
});

/** Conta de garçom: o Gerente pode criar e gerir contas de GARÇOM (não de gerente/admin). */
export async function createWaiterAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  const p = waiterSchema.safeParse({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { error: p.error.issues[0].message };
  const exists = await query("select 1 from admin_users where email = $1", [p.data.email]);
  if (exists.rows[0]) return { error: "Já existe um utilizador com esse email." };
  const r = await query<{ id: string }>(
    "insert into admin_users (email, password_hash, role, name) values ($1,$2,'garcom',$3) returning id",
    [p.data.email, await hashPassword(p.data.password), p.data.name]);
  await audit(m.email, "waiter.create", "admin", r.rows[0].id, { email: p.data.email, name: p.data.name });
  return { ok: `Garçom “${p.data.name}” criado. Entra em /admin com o email e a palavra-passe.` };
}

async function waiterById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await query<{ id: string; role: string }>("select id, role from admin_users where id = $1", [id]);
  return r.rows[0]?.role === "garcom" ? r.rows[0] : null;
}

export async function setWaiterActiveAction(id: string, active: boolean): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  if (!(await waiterById(id))) return { error: "Garçom não encontrado." };
  await query("update admin_users set active = $2 where id = $1 and role = 'garcom'", [id, active]);
  // garçom desativado deixa de estar atribuído às mesas (as chamadas voltam a avisar toda a equipa)
  if (!active) {
    await query("update dining_tables set waiter_id = null where waiter_id = $1", [id]);
    await revokeAllSessions("staff", id);
  }
  await audit(m.email, active ? "waiter.activate" : "waiter.deactivate", "admin", id);
  return { ok: active ? "Garçom ativado." : "Garçom desativado e retirado das mesas." };
}

export async function renameWaiterAction(id: string, name: string): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  const n = name.trim().slice(0, 60);
  if (!n) return { error: "Indique o nome." };
  if (!(await waiterById(id))) return { error: "Garçom não encontrado." };
  await query("update admin_users set name = $2 where id = $1 and role = 'garcom'", [id, n]);
  await audit(m.email, "waiter.rename", "admin", id, { name: n });
  return { ok: "Nome guardado." };
}

export async function resetWaiterPasswordAction(id: string, password: string): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  const p = passwordSchema.safeParse(password);
  if (!p.success) return { error: p.error.issues[0].message };
  if (!(await waiterById(id))) return { error: "Garçom não encontrado." };
  await query("update admin_users set password_hash = $2 where id = $1 and role = 'garcom'", [id, await hashPassword(p.data)]);
  await revokeAllSessions("staff", id);
  await audit(m.email, "waiter.reset_password", "admin", id);
  return { ok: "Palavra-passe redefinida." };
}

/** Atribui (ou retira) o garçom de uma mesa. */
export async function assignTableAction(tableId: number, waiterId: string | null): Promise<AdminFormState> {
  assertEditableHere();
  const m = await manager();
  if (!Number.isInteger(tableId)) return { error: "Mesa inválida." };
  if (waiterId) {
    const w = await query("select 1 from admin_users where id = $1 and role = 'garcom' and active", [waiterId]);
    if (!w.rows[0]) return { error: "Garçom inválido ou desativado." };
  }
  const r = await query("update dining_tables set waiter_id = $2 where id = $1 returning id", [tableId, waiterId]);
  if (!r.rows[0]) return { error: "Mesa não encontrada." };
  await audit(m.email, "table.assign", "table", tableId, { waiterId });
  return { ok: "Atribuição guardada." };
}

// ---------- pagamentos (em mão, no restaurante) — só Admin e Gerente ----------
export async function confirmPaymentAction(input: ConfirmInput): Promise<ConfirmResult> {
  const m = await manager();
  return confirmPayment(input, m.name ?? m.email);
}

export async function voidPaymentAction(id: string, reason: string): Promise<{ ok: boolean; message?: string }> {
  const m = await manager();
  const r = await voidPayment(id, reason, m.name ?? m.email);
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

// ---------- reservas (Admin e Gerente) ----------
export async function decideReservationAction(id: string, to: "approved" | "rejected", note: string | null): Promise<DecideResult> {
  const m = await manager();
  if (to !== "approved" && to !== "rejected") return { ok: false, message: "Decisão inválida." };
  return decideReservation(id, to, note, m.name ?? m.email);
}

// ---------- impressão (Admin e Gerente, no servidor do restaurante) ----------
function assertPrintAgent() {
  if (!isPrintAgent()) throw new Error("As impressoras configuram-se no servidor do restaurante (rede local), não no site na internet.");
}
const ipOrHost = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$|^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const printerSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "Dê um nome à impressora (ex.: Cozinha).").max(40),
  station: z.enum(["kitchen", "counter"], { message: "Escolha cozinha ou balcão." }),
  connection: z.enum(["network", "usb"], { message: "Escolha o tipo de ligação." }),
  host: z.string().trim().max(100).optional(),
  port: z.coerce.number().int().min(1).max(65535).default(9100),
  devicePath: z.string().trim().max(120).optional(),
  paperWidth: z.coerce.number().refine((v) => v === 58 || v === 80, "Papel de 58 ou 80 mm."),
  codepage: z.enum(["cp860", "cp850", "ascii"]),
  copies: z.coerce.number().int().min(1).max(3).default(1),
  autoPrint: z.boolean(),
  categories: z.array(z.string().max(60)).max(60),
});

export async function savePrinterAction(_: AdminFormState, fd: FormData): Promise<AdminFormState> {
  assertPrintAgent();
  const m = await manager();
  const p = printerSchema.safeParse({
    id: fd.get("id") || undefined, name: fd.get("name"), station: fd.get("station"), connection: fd.get("connection"),
    host: fd.get("host") ?? undefined, port: fd.get("port") || 9100, devicePath: fd.get("devicePath") ?? undefined,
    paperWidth: fd.get("paperWidth"), codepage: fd.get("codepage") ?? "cp860", copies: fd.get("copies") || 1,
    autoPrint: fd.get("autoPrint") === "on", categories: fd.getAll("categories").map(String),
  });
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  if (d.connection === "network" && (!d.host || !ipOrHost.test(d.host))) return { error: "Indique o endereço IP da impressora (ex.: 192.168.1.50)." };
  const allowTmp = process.env.NOKAU_PRINT_ALLOW_TMP === "1";
  if (d.connection === "usb" && !(d.devicePath && (/^\/dev\/(usb\/lp\d+|lp\d+)$/.test(d.devicePath) || (allowTmp && /^\/tmp\/[\w./-]+$/.test(d.devicePath) && !d.devicePath.includes("..")))))
    return { error: "Indique o dispositivo USB (ex.: /dev/usb/lp0)." };
  const known = new Set((await query<{ id: string }>("select id from menu_categories")).rows.map((r) => r.id));
  const cats = d.categories.filter((c) => known.has(c));
  const values = [d.name, d.station, d.connection, d.connection === "network" ? d.host : null, d.port, d.connection === "usb" ? d.devicePath : null,
    d.paperWidth, d.codepage, cats.length ? cats : null, d.autoPrint, d.copies];
  if (d.id) {
    await query(`update printers set name=$2, station=$3, connection=$4, host=$5, port=$6, device_path=$7, paper_width=$8, codepage=$9, categories=$10,
                   auto_print=$11, copies=$12 where id=$1`, [d.id, ...values]);
    await audit(m.email, "printer.update", "printer", d.id, { name: d.name });
    return { ok: "Impressora guardada." };
  }
  const r = await query<{ id: number }>(
    `insert into printers (name, station, connection, host, port, device_path, paper_width, codepage, categories, auto_print, copies)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`, values);
  await audit(m.email, "printer.create", "printer", r.rows[0].id, { name: d.name });
  return { ok: `Impressora “${d.name}” adicionada. Faça um teste de impressão.` };
}

export async function setPrinterActiveAction(id: number, active: boolean): Promise<AdminFormState> {
  assertPrintAgent();
  const m = await manager();
  // ao reativar: só pedidos aceites a partir de agora (não imprime de uma vez tudo o que ficou para trás)
  await query("update printers set active = $2, enabled_at = case when $2 then now() else enabled_at end where id = $1", [id, active]);
  await audit(m.email, active ? "printer.activate" : "printer.deactivate", "printer", id);
  return { ok: active ? "Impressora ativada." : "Impressora desativada (não recebe talões)." };
}

export async function testPrinterConnectionAction(id: number): Promise<{ ok: boolean; message: string }> {
  assertPrintAgent();
  await manager();
  const p = (await query<PrinterRow>("select * from printers where id = $1", [id])).rows[0];
  if (!p) return { ok: false, message: "Impressora não encontrada." };
  const st = await probe(connOf(p));
  const label = st.reachable ? (st.paperOut ? "paper_out" : st.coverOpen ? "cover_open" : st.paperNearEnd ? "paper_low" : "online") : "offline";
  await query("update printers set last_status = $2, last_status_at = now(), last_error = $3 where id = $1", [id, label, st.error]);
  if (!st.reachable) return { ok: false, message: st.error ?? "Sem ligação." };
  const extra = st.paperOut ? " Atenção: SEM PAPEL." : st.coverOpen ? " Atenção: TAMPA ABERTA." : st.paperNearEnd ? " Papel a acabar." : st.paperOut === null ? " (A impressora não informa o estado do papel.)" : " Papel OK.";
  return { ok: !st.paperOut && !st.coverOpen, message: `Ligação OK.${extra}` };
}

export async function testPrintAction(id: number): Promise<AdminFormState> {
  assertPrintAgent();
  const m = await manager();
  await enqueueTest(id, m.name ?? m.email);
  return { ok: "Teste enviado para a fila — deve sair dentro de segundos." };
}

export async function reprintAction(orderId: string, printerId: number, key: string): Promise<AdminFormState> {
  assertPrintAgent();
  const m = await staff(); // o garçom também pode pedir reimpressão (ex.: talão perdido)
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !Number.isInteger(printerId) || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) return { error: "Pedido inválido." };
  const added = await enqueueReprint(orderId, printerId, m.name ?? m.email, key);
  if (added) await audit(m.email, "print.reprint", "order", orderId, { printerId });
  return { ok: added ? "Reimpressão enviada para a fila." : "Esta reimpressão já foi pedida." };
}

export async function retryPrintJobAction(id: string): Promise<AdminFormState> {
  assertPrintAgent();
  const m = await manager();
  await retryJob(id);
  await audit(m.email, "print.retry", "print_job", id);
  return { ok: "Volta a tentar imprimir." };
}

export async function cancelPrintJobAction(id: string): Promise<AdminFormState> {
  assertPrintAgent();
  const m = await manager();
  await cancelJob(id);
  await audit(m.email, "print.cancel", "print_job", id);
  return { ok: "Trabalho cancelado." };
}
