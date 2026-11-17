import "server-only";
import { query, tx } from "@/lib/db";
import { MIGRATE_MENU_SQL, MIGRATE_ROLES_SQL, MIGRATE_PAYMENTS_SQL, MIGRATE_RESERVATIONS_SQL, MIGRATE_PRINT_SQL, MIGRATE_RECEIPTS_SQL, MIGRATE_SECURITY_SQL, MIGRATE_SERVICE_SQL, MIGRATE_SYNC_SQL, SCHEMA_SQL } from "./schema";
import { isLocalServer } from "@/lib/node-role";
import { newQrToken } from "@/lib/tokens";

/** Cria o esquema (se faltar) e as 10 mesas por defeito (só se ainda não houver mesas). */
export async function initDatabase(defaultTables = 10) {
  await query(SCHEMA_SQL);
  await migrateRoles();
  // no servidor local as mesas (e os seus QR Codes) vêm do servidor central, com os mesmos ids e tokens
  if (isLocalServer()) return;
  await tx(async (c) => {
    const n = await c.query<{ n: string }>("select count(*) n from dining_tables");
    if (Number(n.rows[0].n) === 0) {
      for (let i = 1; i <= defaultTables; i++) {
        await c.query("insert into dining_tables (number, label, qr_token) values ($1,$2,$3)", [i, `Mesa ${i}`, newQrToken()]);
      }
    }
  });
}

export async function hasAdmin(): Promise<boolean> {
  try {
    const r = await query<{ n: string }>("select count(*) n from admin_users");
    return Number(r.rows[0].n) > 0;
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return false; // esquema ainda não criado
    throw e; // erro de ligação NÃO significa "sem gerente"
  }
}

let migrated: Promise<void> | null = null;

/** Já está tudo no formato atual? (só leitura — evita DDL, que bloqueia a tabela, em cada arranque a frio) */
async function upToDate(): Promise<boolean> {
  const r = await query<{ ok: boolean }>(
    `select (
       (select count(*) from information_schema.columns where table_schema = current_schema() and table_name = 'menu_items' and column_name in ('image_path','review_note')) = 2
       and coalesce((select pg_get_constraintdef(oid) like '%garcom%' from pg_constraint where conname = 'admin_users_role_check'), false)
       and exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'service_calls')
       and exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'dining_tables' and column_name = 'waiter_id')
       and exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'payments')
       and exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'orders' and column_name = 'payment_id')
       and exists (select 1 from pg_trigger where tgname = 'payments_guard_trg')
       and exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'reservations')
       and exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'print_jobs')
       and exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'auth_throttle')
       and exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'payments' and column_name = 'receipt_number')
       and exists (select 1 from pg_trigger where tgname = 'payments_receipt_trg')
       and not exists (select 1 from payments where receipt_number is null)
       and not exists (select 1 from admin_users where role in ('manager','staff'))
       and exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'orders' and column_name = 'needs_push')
       and exists (select 1 from information_schema.tables where table_schema = current_schema() and table_name = 'sync_state')
       and not exists (select 1 from pg_constraint where conname = 'orders_number_key')
     ) ok`);
  return !!r.rows[0]?.ok;
}

/** Garante (uma vez por instância) que os papéis e colunas estão no formato novo. Seguro em bases já em uso. */
export function ensureMigrated(): Promise<void> {
  if (!migrated) {
    migrated = (async () => { if (!(await upToDate())) await migrateRoles(); })().catch((e) => {
      migrated = null; // tenta de novo no próximo pedido (ex.: tabelas ainda não existem antes do primeiro acesso)
      throw e;
    });
  }
  return migrated;
}

async function migrateRoles() {
  await tx(async (c) => { await c.query(MIGRATE_ROLES_SQL); await c.query(MIGRATE_MENU_SQL); await c.query(MIGRATE_SYNC_SQL); await c.query(MIGRATE_SERVICE_SQL); await c.query(MIGRATE_PAYMENTS_SQL); await c.query(MIGRATE_RESERVATIONS_SQL); await c.query(MIGRATE_PRINT_SQL); await c.query(MIGRATE_SECURITY_SQL); await c.query(MIGRATE_RECEIPTS_SQL); });
}
