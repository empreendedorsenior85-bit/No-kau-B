/**
 * Esquema da base de dados (PostgreSQL). Idempotente: pode correr-se várias vezes.
 * Funciona em Supabase, Neon ou Postgres próprio. Sem dados fictícios.
 */
export const SCHEMA_SQL = /* sql */ `
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null default 'gerente' check (role in ('admin','gerente')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists dining_tables (
  id serial primary key,
  number int not null unique check (number > 0),
  label text not null check (length(label) between 1 and 40),
  qr_token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  token_rotated_at timestamptz
);

create table if not exists menu_categories (
  id text primary key,
  label text not null,
  description text not null default '',
  position int not null default 0,
  active boolean not null default true
);

create table if not exists menu_items (
  id serial primary key,
  category_id text not null references menu_categories(id),
  name text not null check (length(name) between 1 and 120),
  description text not null default '' check (length(description) <= 400),
  price int not null check (price >= 0 and price <= 1000000),
  available boolean not null default true,
  active boolean not null default true,
  is_demo boolean not null default false,
  position int not null default 0,
  image bytea,
  image_type text,
  image_version int not null default 0,
  image_path text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists orders_number_seq;
create sequence if not exists orders_rev_seq;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('orders_number_seq'),
  table_id int not null references dining_tables(id),
  status text not null default 'pending' check (status in ('pending','preparing','done')),
  total int not null check (total >= 0),
  is_test boolean not null default false,
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default nextval('orders_rev_seq')
);
create index if not exists orders_rev_idx on orders(rev);
create index if not exists orders_table_idx on orders(table_id, created_at desc);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_updated_idx on orders(updated_at);

create table if not exists order_items (
  id serial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id int references menu_items(id) on delete set null,
  name text not null,
  unit_price int not null check (unit_price >= 0),
  quantity int not null check (quantity between 1 and 20),
  note text check (note is null or length(note) <= 200)
);
create index if not exists order_items_order_idx on order_items(order_id);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb
);

create or replace function orders_touch() returns trigger as $$
begin
  new.updated_at := now();
  new.rev := nextval('orders_rev_seq');
  return new;
end $$ language plpgsql;
drop trigger if exists orders_touch_trg on orders;
create trigger orders_touch_trg before update on orders
  for each row execute function orders_touch();

-- Supabase expõe o schema public por API: RLS ligado e sem políticas = nada acessível
-- com a chave pública. A aplicação acede apenas pelo servidor (DATABASE_URL).
alter table admin_users enable row level security;
alter table dining_tables enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table audit_log enable row level security;

insert into menu_categories (id, label, description, position) values
  ('entradas','Entradas','Para começar a noite.',1),
  ('principais','Pratos principais','Da grelha e da cozinha.',2),
  ('casa','Especialidades da casa','O que nos define.',3),
  ('tradicionais','Especialidades tradicionais','A mesa guineense.',4),
  ('acompanhamentos','Acompanhamentos','Para partilhar.',5),
  ('sobremesas','Sobremesas','Um final doce.',6),
  ('bebidas','Bebidas & cocktails','Do bar do Nô Kau.',7)
on conflict (id) do nothing;
`;

/**
 * Migração de papéis (idempotente): "manager" -> "admin" (quem configurou o sistema) e "staff" -> "gerente".
 * Executada com bloqueio para duas instâncias não a correrem ao mesmo tempo.
 */
export const MIGRATE_ROLES_SQL = /* sql */ `
select pg_advisory_xact_lock(727001);
alter table admin_users drop constraint if exists admin_users_role_check;
update admin_users set role = 'admin' where role = 'manager';
update admin_users set role = 'gerente' where role = 'staff';
alter table admin_users add constraint admin_users_role_check check (role in ('admin','gerente','garcom'));
alter table admin_users alter column role set default 'gerente';
`;

/** Fotografia por ficheiro estático (/menu/xxx.webp) e nota "a confirmar" pelo gerente. Idempotente. */
export const MIGRATE_MENU_SQL = /* sql */ `
alter table menu_items add column if not exists image_path text;
alter table menu_items add column if not exists review_note text;
`;

/**
 * Funcionamento offline / servidor local (idempotente, com bloqueio):
 *  - `origin`: onde o pedido nasceu ('central' = site na internet, 'local' = servidor do restaurante).
 *    O número é único POR ORIGEM (#0042 no central, L0042 no local): os dois servidores numeram
 *    sem se falarem e nunca colidem.
 *  - `status_changed_at`: última mudança de estado — decide conflitos (vence a mais recente).
 *  - `needs_push` (só no servidor local): alteração ainda não enviada ao central.
 *  - `sync_state`: estado da sincronização (cursor, último sucesso/erro, último contacto do servidor local).
 */
export const MIGRATE_SYNC_SQL = /* sql */ `
select pg_advisory_xact_lock(727002);
alter table orders add column if not exists origin text not null default 'central';
alter table orders drop constraint if exists orders_origin_check;
alter table orders add constraint orders_origin_check check (origin in ('central','local'));
alter table orders add column if not exists status_changed_at timestamptz;
update orders set status_changed_at = updated_at where status_changed_at is null;
alter table orders alter column status_changed_at set default now();
alter table orders alter column status_changed_at set not null;
alter table orders add column if not exists needs_push boolean not null default false;
alter table orders add column if not exists synced_at timestamptz;
alter table orders drop constraint if exists orders_number_key;
create unique index if not exists orders_origin_number_uq on orders(origin, number);
create index if not exists orders_needs_push_idx on orders(needs_push) where needs_push;
create sequence if not exists orders_local_number_seq;
create table if not exists sync_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table sync_state enable row level security;
`;

/**
 * Etapa 3 — atendimento (idempotente, com bloqueio):
 *  - perfil 'garcom' e nome a mostrar em admin_users;
 *  - garçom atribuído a cada mesa (dining_tables.waiter_id);
 *  - chamadas do cliente (service_calls): chamar empregado, chamar gerente, pedir a conta.
 *    O `rev` usa a MESMA sequência dos pedidos: um só cursor no tempo real e na sincronização.
 */
export const MIGRATE_SERVICE_SQL = /* sql */ `
select pg_advisory_xact_lock(727003);
alter table admin_users drop constraint if exists admin_users_role_check;
alter table admin_users add constraint admin_users_role_check check (role in ('admin','gerente','garcom'));
alter table admin_users add column if not exists name text check (name is null or length(name) between 1 and 60);
alter table dining_tables add column if not exists waiter_id uuid references admin_users(id) on delete set null;
create table if not exists service_calls (
  id uuid primary key default gen_random_uuid(),
  table_id int not null references dining_tables(id),
  kind text not null check (kind in ('waiter','manager','bill')),
  status text not null default 'open' check (status in ('open','ack','done','cancelled')),
  amount int check (amount is null or amount >= 0),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 64),
  origin text not null default 'central' check (origin in ('central','local')),
  created_at timestamptz not null default now(),
  ack_at timestamptz,
  ack_by text,
  done_at timestamptz,
  done_by text,
  status_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default nextval('orders_rev_seq'),
  needs_push boolean not null default false,
  synced_at timestamptz
);
create index if not exists service_calls_rev_idx on service_calls(rev);
create index if not exists service_calls_table_idx on service_calls(table_id, created_at desc);
create index if not exists service_calls_open_idx on service_calls(status) where status in ('open','ack');
create index if not exists service_calls_updated_idx on service_calls(updated_at);
create index if not exists service_calls_push_idx on service_calls(needs_push) where needs_push;
drop trigger if exists service_calls_touch_trg on service_calls;
create trigger service_calls_touch_trg before update on service_calls
  for each row execute function orders_touch();
alter table service_calls enable row level security;
`;

/**
 * Etapa 4 — clientes e pagamentos (idempotente, com bloqueio):
 *  - customers: conta única do cliente (nome, email, telefone, palavra-passe com scrypt);
 *  - orders.customer_id: pedidos feitos com sessão iniciada (só no site central);
 *  - payments: pagamento EM MÃO no restaurante, confirmado pelo gerente. IMUTÁVEL: a base de dados recusa
 *    alterar valor, método, mesa, data ou quem recebeu, e recusa apagar. Só se pode ANULAR (com motivo, registado).
 *  - orders.payment_id: o pedido fica pago por esse pagamento (um pedido nunca é pago duas vezes).
 */
export const MIGRATE_PAYMENTS_SQL = /* sql */ `
select pg_advisory_xact_lock(727004);
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  email text not null unique check (length(email) between 5 and 160),
  phone text not null unique check (phone ~ '^\\+?[0-9]{7,15}$'),
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table customers enable row level security;
alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;
create index if not exists orders_customer_idx on orders(customer_id, created_at desc) where customer_id is not null;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  table_id int not null references dining_tables(id),
  amount int not null check (amount > 0 and amount <= 100000000),
  method text not null check (method in ('cash','orange_money','mtn_momo','card','transfer')),
  tendered int check (tendered is null or tendered >= amount),
  received_by text not null check (length(received_by) between 1 and 160),
  note text check (note is null or length(note) <= 200),
  status text not null default 'confirmed' check (status in ('confirmed','voided')),
  voided_at timestamptz,
  voided_by text,
  void_reason text check (void_reason is null or length(void_reason) between 3 and 200),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 64),
  origin text not null default 'central' check (origin in ('central','local')),
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default nextval('orders_rev_seq'),
  needs_push boolean not null default false,
  synced_at timestamptz
);
create index if not exists payments_created_idx on payments(created_at desc);
create index if not exists payments_rev_idx on payments(rev);
create index if not exists payments_push_idx on payments(needs_push) where needs_push;
alter table payments enable row level security;
alter table orders add column if not exists payment_id uuid references payments(id);
create index if not exists orders_payment_idx on orders(payment_id) where payment_id is not null;

-- proteção contra alterações não autorizadas (vale para qualquer acesso à base, não só pela aplicação)
create or replace function payments_guard() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Pagamentos não podem ser apagados (use anular)' using errcode = 'P0001';
  end if;
  if new.id <> old.id or new.table_id <> old.table_id or new.amount <> old.amount or new.method <> old.method
     or new.tendered is distinct from old.tendered or new.received_by <> old.received_by or new.created_at <> old.created_at
     or new.idempotency_key <> old.idempotency_key or new.origin <> old.origin or new.note is distinct from old.note then
    raise exception 'Um pagamento confirmado não pode ser alterado (só anulado, com motivo)' using errcode = 'P0001';
  end if;
  if old.status = 'voided' and new.status <> 'voided' then
    raise exception 'Um pagamento anulado não pode voltar a ser confirmado' using errcode = 'P0001';
  end if;
  if new.status = 'voided' and old.status = 'confirmed' and (new.void_reason is null or new.voided_by is null or new.voided_at is null) then
    raise exception 'Anular exige motivo, autor e data' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  new.rev := nextval('orders_rev_seq');
  return new;
end $$ language plpgsql;
drop trigger if exists payments_guard_trg on payments;
create trigger payments_guard_trg before update or delete on payments for each row execute function payments_guard();
`;

/**
 * Reservas (idempotente, com bloqueio). Feitas no site; analisadas pelo Admin/Gerente (Pendente → Aprovada/Rejeitada;
 * o cliente pode cancelar enquanto está pendente). `access_token`: link secreto do cliente para acompanhar a reserva.
 * `rev` na mesma sequência dos pedidos: o painel recebe-as pelo mesmo canal em tempo real.
 */
export const MIGRATE_RESERVATIONS_SQL = /* sql */ `
select pg_advisory_xact_lock(727005);
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^R-[A-Z0-9]{6}$'),
  access_token text not null unique check (length(access_token) between 20 and 64),
  customer_id uuid references customers(id) on delete set null,
  name text not null check (length(name) between 2 and 80),
  phone text not null check (length(phone) between 7 and 20),
  email text not null check (length(email) between 5 and 160),
  date date not null,
  time time not null,
  guests int not null check (guests between 1 and 30),
  notes text check (notes is null or length(notes) <= 600),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by text,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 300),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 64),
  origin text not null default 'central' check (origin in ('central','local')),
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default nextval('orders_rev_seq'),
  needs_push boolean not null default false,
  synced_at timestamptz
);
create index if not exists reservations_date_idx on reservations(date, time);
create index if not exists reservations_status_idx on reservations(status, date);
create index if not exists reservations_rev_idx on reservations(rev);
create index if not exists reservations_updated_idx on reservations(updated_at);
create index if not exists reservations_customer_idx on reservations(customer_id) where customer_id is not null;
create index if not exists reservations_push_idx on reservations(needs_push) where needs_push;
drop trigger if exists reservations_touch_trg on reservations;
create trigger reservations_touch_trg before update on reservations for each row execute function orders_touch();
alter table reservations enable row level security;
`;

/**
 * Etapa 5 — impressão (idempotente, com bloqueio). Usado pelo agente de impressão do SERVIDOR LOCAL do restaurante
 * (é quem chega às impressoras da rede/USB). Na base do site central as tabelas existem mas ficam vazias.
 *  - printers: cozinha / balcão; rede (IP:9100) ou USB (/dev/usb/lp0); papel 58/80 mm; tabela de caracteres; categorias.
 *  - print_jobs: fila + histórico. `dedupe_key` único: um pedido aceite gera UM talão por impressora, nunca dois.
 */
export const MIGRATE_PRINT_SQL = /* sql */ `
select pg_advisory_xact_lock(727006);
create table if not exists printers (
  id serial primary key,
  name text not null check (length(name) between 1 and 40),
  station text not null check (station in ('kitchen','counter')),
  connection text not null check (connection in ('network','usb')),
  host text check (host is null or length(host) <= 100),
  port int not null default 9100 check (port between 1 and 65535),
  device_path text check (device_path is null or device_path ~ '^/dev/(usb/lp[0-9]+|lp[0-9]+)$' or device_path ~ '^/tmp/'),
  paper_width int not null default 80 check (paper_width in (58, 80)),
  codepage text not null default 'cp860' check (codepage in ('cp860','cp850','ascii')),
  categories text[],
  auto_print boolean not null default true,
  copies int not null default 1 check (copies between 1 and 3),
  active boolean not null default true,
  enabled_at timestamptz not null default now(),
  last_status text,
  last_status_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check ((connection = 'network' and host is not null) or (connection = 'usb' and device_path is not null))
);
create table if not exists print_jobs (
  id uuid primary key default gen_random_uuid(),
  printer_id int not null references printers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  kind text not null check (kind in ('order','reprint','test')),
  status text not null default 'queued' check (status in ('queued','printing','printed','failed','uncertain','cancelled')),
  dedupe_key text unique,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  requested_by text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  printed_at timestamptz,
  bytes int
);
create index if not exists print_jobs_queue_idx on print_jobs(status, next_attempt_at) where status in ('queued','printing');
create index if not exists print_jobs_created_idx on print_jobs(created_at desc);
create index if not exists print_jobs_order_idx on print_jobs(order_id);
alter table printers enable row level security;
alter table print_jobs enable row level security;
`;

/** Segurança: sessões revogáveis no servidor e limites de tentativas de login partilhados por todas as instâncias. */
export const MIGRATE_SECURITY_SQL = /* sql */ `
select pg_advisory_xact_lock(727007);
-- A sessão só é válida se existir aqui (e não estiver revogada). O cookie guarda um segredo aleatório; aqui fica só o seu hash.
create table if not exists auth_sessions (
  id_hash text primary key,
  kind text not null check (kind in ('staff','client')),
  subject uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  user_agent text
);
create index if not exists auth_sessions_subject_idx on auth_sessions(kind, subject) where revoked_at is null;
create index if not exists auth_sessions_expires_idx on auth_sessions(expires_at);
-- Tentativas falhadas (chave = hash de "tipo|conta" ou "tipo|ip|conta"): funciona com várias instâncias da Vercel.
create table if not exists auth_throttle (
  key_hash text primary key,
  fails int not null default 0,
  window_until timestamptz not null
);
create index if not exists auth_throttle_until_idx on auth_throttle(window_until);
alter table auth_sessions enable row level security;
alter table auth_throttle enable row level security;
`;
