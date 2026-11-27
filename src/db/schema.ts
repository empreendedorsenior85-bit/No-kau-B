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
  method text not null check (method in ('cash','orange_money','telecel','mtn_momo','card','transfer')),
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

/**
 * Recibos: cada pagamento tem um número sequencial atribuído pelo servidor onde foi registado
 * (central: REC-000012; servidor local: REC-L000004). O número segue na sincronização e nunca muda.
 */
export const MIGRATE_RECEIPTS_SQL = /* sql */ `
select pg_advisory_xact_lock(727008);
alter table payments add column if not exists receipt_number int check (receipt_number is null or receipt_number > 0);
create unique index if not exists payments_receipt_uq on payments(origin, receipt_number) where receipt_number is not null;
create sequence if not exists payments_receipt_seq;
create sequence if not exists payments_local_receipt_seq;
-- guarda: além das regras anteriores, o número do recibo, uma vez atribuído, não muda
create or replace function payments_guard() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Pagamentos não podem ser apagados (use anular)' using errcode = 'P0001';
  end if;
  if new.id <> old.id or new.table_id <> old.table_id or new.amount <> old.amount or new.method <> old.method
     or new.tendered is distinct from old.tendered or new.received_by <> old.received_by or new.created_at <> old.created_at
     or new.idempotency_key <> old.idempotency_key or new.origin <> old.origin or new.note is distinct from old.note
     or (old.receipt_number is not null and new.receipt_number is distinct from old.receipt_number) then
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
-- qualquer pagamento inserido sem número (outro caminho que não a aplicação, versão antiga) recebe o seguinte da sua série;
-- a série nunca fica atrás do maior número já usado
create or replace function payments_receipt_number() returns trigger as $$
declare seq text; n int; m int;
begin
  if new.receipt_number is null then
    seq := case when new.origin = 'local' then 'payments_local_receipt_seq' else 'payments_receipt_seq' end;
    n := nextval(seq);
    select coalesce(max(receipt_number), 0) + 1 into m from payments where origin = new.origin;
    if m > n then n := m; perform setval(seq, n); end if;
    new.receipt_number := n;
  end if;
  return new;
end $$ language plpgsql;
drop trigger if exists payments_receipt_trg on payments;
create trigger payments_receipt_trg before insert on payments for each row execute function payments_receipt_number();
-- pagamentos anteriores: numerados por ordem (data, id) — a mesma ordem no central e no servidor local
with base as (
  select origin, coalesce(max(receipt_number), 0) m from payments group by origin
), n as (
  select p.id, b.m + row_number() over (partition by p.origin order by p.created_at, p.id) rn
  from payments p join base b on b.origin = p.origin where p.receipt_number is null
)
update payments p set receipt_number = n.rn from n where p.id = n.id;
select setval('payments_receipt_seq', greatest(m, 1), m > 0) from (select coalesce(max(receipt_number), 0) m from payments where origin = 'central') x;
select setval('payments_local_receipt_seq', greatest(m, 1), m > 0) from (select coalesce(max(receipt_number), 0) m from payments where origin = 'local') x;
`;

/**
 * Contas de cliente também no servidor local do restaurante (para entrar e pedir mesmo sem internet).
 *  - central → local: todas as contas (nome, email, telefone, hash da palavra-passe, ativa) — nunca a palavra-passe;
 *  - local → central: contas criadas no restaurante (needs_push);
 *  - a mesma pessoa registada nos dois lados (mesmo email/telefone): fica a conta do central; a do restaurante passa a
 *    ser um "pseudónimo" dela (customer_aliases) e os pedidos feitos com ela ficam na conta certa.
 */
export const MIGRATE_CUSTOMER_SYNC_SQL = /* sql */ `
select pg_advisory_xact_lock(727009);
alter table customers add column if not exists origin text not null default 'central' check (origin in ('central','local'));
alter table customers add column if not exists updated_at timestamptz not null default now();
alter table customers add column if not exists rev bigint not null default nextval('orders_rev_seq');
alter table customers add column if not exists needs_push boolean not null default false;
create index if not exists customers_rev_idx on customers(rev);
create index if not exists customers_push_idx on customers(needs_push) where needs_push;
create or replace function customers_touch() returns trigger as $$
begin
  new.updated_at := now();
  new.rev := nextval('orders_rev_seq');
  return new;
end $$ language plpgsql;
drop trigger if exists customers_touch_trg on customers;
create trigger customers_touch_trg before update on customers for each row
  when (old.name is distinct from new.name or old.email is distinct from new.email or old.phone is distinct from new.phone
        or old.password_hash is distinct from new.password_hash or old.active is distinct from new.active)
  execute function customers_touch();
create table if not exists customer_aliases (
  alias_id uuid primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table customer_aliases enable row level security;
`;

/** Impressoras Bluetooth (clássico/SPP): ligadas ao servidor do restaurante como dispositivo série /dev/rfcommN. */
export const MIGRATE_PRINT_BT_SQL = /* sql */ `
select pg_advisory_xact_lock(727010);
alter table printers drop constraint if exists printers_connection_check;
alter table printers add constraint printers_connection_check check (connection in ('network','usb','bluetooth'));
alter table printers drop constraint if exists printers_device_path_check;
alter table printers add constraint printers_device_path_check check (device_path is null
  or device_path ~ '^/dev/(usb/lp[0-9]+|lp[0-9]+|rfcomm[0-9]+)$' or device_path ~ '^/tmp/');
alter table printers drop constraint if exists printers_check;
alter table printers add constraint printers_check check (
  (connection = 'network' and host is not null) or (connection in ('usb','bluetooth') and device_path is not null));
`;

/**
 * Personalização dos recibos e talões: uma configuração por estabelecimento (id = 1) e o logótipo.
 * Editada no site central; copiada para o servidor do restaurante (onde se imprime). Talões de recibo na fila de impressão.
 */
export const MIGRATE_RECEIPT_SETTINGS_SQL = /* sql */ `
select pg_advisory_xact_lock(727011);
create table if not exists receipt_settings (
  id int primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  logo bytea,
  logo_type text check (logo_type is null or logo_type = 'image/png'),
  logo_version int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into receipt_settings (id) values (1) on conflict (id) do nothing;
alter table receipt_settings enable row level security;
alter table print_jobs add column if not exists payment_id uuid references payments(id);
alter table print_jobs drop constraint if exists print_jobs_kind_check;
alter table print_jobs add constraint print_jobs_kind_check check (kind in ('order','reprint','test','receipt'));
`;

/**
 * Perfil de visitante (sem palavra-passe) para acompanhar reservas.
 *  - o email da reserva passa a opcional (nome completo e telefone continuam obrigatórios);
 *  - o perfil fica ligado ao aparelho (sessão no servidor) e vê as reservas feitas nesse aparelho;
 *  - noutro aparelho, cada reserva junta-se com telefone + código dessa reserva (um código abre só a sua reserva):
 *    sem SMS não se prova a posse do telefone, por isso o telefone sozinho nunca dá acesso a reservas.
 */
export const MIGRATE_VISITORS_SQL = /* sql */ `
select pg_advisory_xact_lock(727012);
alter table reservations alter column email drop not null;
alter table reservations drop constraint if exists reservations_email_check;
alter table reservations add constraint reservations_email_check check (email is null or length(email) between 5 and 160);
create table if not exists visitors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  phone text not null check (phone ~ '^\\+?[0-9]{7,15}$'),
  email text check (email is null or length(email) between 5 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visitors_phone_idx on visitors(phone);
create table if not exists visitor_reservations (
  visitor_id uuid not null references visitors(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  via text not null check (via in ('created','code')),
  added_at timestamptz not null default now(),
  primary key (visitor_id, reservation_id)
);
create index if not exists visitor_reservations_res_idx on visitor_reservations(reservation_id);
alter table visitors enable row level security;
alter table visitor_reservations enable row level security;
alter table auth_sessions drop constraint if exists auth_sessions_kind_check;
alter table auth_sessions add constraint auth_sessions_kind_check check (kind in ('staff','client','visitor'));
`;

/**
 * Gestão de stock (por produto do menu, 1 vendido = 1 a menos).
 *  - stock_levels: produtos com stock controlado (quantidade atual, mínimo, esgotado automático);
 *  - stock_movements: histórico IMUTÁVEL de cada entrada, saída, contagem, venda e estorno;
 *  - stock_move(): única forma de mudar a quantidade (atualiza, regista o movimento e o esgotado automático);
 *  - gatilhos em orders/order_items: o pedido CONCLUÍDO desconta; se deixar de estar concluído, repõe.
 *    O cálculo é por diferença (o que já foi descontado vs. o que deve estar), por isso é idempotente
 *    (sincronização repetida, ida e volta de estado) e funciona para pedidos vindos do servidor local.
 *    Pedidos de teste não mexem no stock.
 */
export const MIGRATE_STOCK_SQL = /* sql */ `
select pg_advisory_xact_lock(727013);
create table if not exists stock_levels (
  menu_item_id int primary key references menu_items(id) on delete cascade,
  quantity int not null default 0 check (quantity between -100000 and 1000000),
  min_quantity int not null default 0 check (min_quantity between 0 and 100000),
  auto_soldout boolean not null default true,
  soldout_by_stock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  rev bigint not null default nextval('orders_rev_seq')
);
create index if not exists stock_levels_rev_idx on stock_levels(rev);
create table if not exists stock_movements (
  id bigserial primary key,
  menu_item_id int not null references menu_items(id) on delete cascade,
  kind text not null check (kind in ('inicial','entrada','saida','ajuste','venda','estorno')),
  delta int not null,
  quantity_after int not null,
  reason text check (reason is null or length(reason) <= 200),
  order_id uuid,
  actor text not null check (length(actor) between 1 and 160),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item_idx on stock_movements(menu_item_id, created_at desc);
create index if not exists stock_movements_created_idx on stock_movements(created_at desc);
create index if not exists stock_movements_order_idx on stock_movements(order_id) where order_id is not null;
alter table stock_levels enable row level security;
alter table stock_movements enable row level security;

create or replace function stock_levels_touch() returns trigger as $$
begin
  new.rev := nextval('orders_rev_seq');
  new.updated_at := now();
  return new;
end $$ language plpgsql;
drop trigger if exists stock_levels_touch_trg on stock_levels;
create trigger stock_levels_touch_trg before update on stock_levels for each row execute function stock_levels_touch();

-- histórico imutável (só desaparece se o próprio produto do menu for apagado)
create or replace function stock_movements_guard() returns trigger as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from menu_items where id = old.menu_item_id) then return old; end if;
  raise exception 'Movimentos de stock não podem ser alterados nem apagados';
end $$ language plpgsql;
drop trigger if exists stock_movements_guard_trg on stock_movements;
create trigger stock_movements_guard_trg before update or delete on stock_movements for each row execute function stock_movements_guard();

-- esgotado automático: a zero (ou menos) tira o produto do menu; com stock volta a pô-lo,
-- mas só se foi o stock que o tirou (um produto desligado à mão pelo gerente fica como está)
create or replace function stock_sync_availability(p_item int) returns void as $$
declare l stock_levels;
begin
  select * into l from stock_levels where menu_item_id = p_item;
  if not found then return; end if;
  if l.auto_soldout and l.quantity <= 0 then
    if not l.soldout_by_stock then
      update menu_items set available = false, updated_at = now() where id = p_item and available;
      if found then update stock_levels set soldout_by_stock = true where menu_item_id = p_item; end if;
    end if;
  elsif l.soldout_by_stock then
    update menu_items set available = true, updated_at = now() where id = p_item;
    update stock_levels set soldout_by_stock = false where menu_item_id = p_item;
  end if;
end $$ language plpgsql;

create or replace function stock_move(p_item int, p_delta int, p_kind text, p_reason text, p_order uuid, p_actor text) returns int as $$
declare q int;
begin
  update stock_levels set quantity = quantity + p_delta, updated_by = p_actor where menu_item_id = p_item returning quantity into q;
  if not found then return null; end if;
  insert into stock_movements (menu_item_id, kind, delta, quantity_after, reason, order_id, actor)
    values (p_item, p_kind, p_delta, q, p_reason, p_order, p_actor);
  perform stock_sync_availability(p_item);
  return q;
end $$ language plpgsql;

create or replace function stock_apply_order(p_order uuid) returns void as $$
declare o record; it record; want int; have int;
begin
  select id, status, is_test, origin, number into o from orders where id = p_order;
  if not found then return; end if;
  for it in
    select oi.menu_item_id, sum(oi.quantity)::int q
    from order_items oi join stock_levels s on s.menu_item_id = oi.menu_item_id
    where oi.order_id = p_order group by oi.menu_item_id
  loop
    want := case when o.status = 'done' and not o.is_test then -it.q else 0 end;
    select coalesce(sum(delta), 0) into have from stock_movements
      where order_id = p_order and menu_item_id = it.menu_item_id and kind in ('venda','estorno');
    if want <> have then
      perform stock_move(it.menu_item_id, want - have, case when want < have then 'venda' else 'estorno' end,
        'Pedido ' || case when o.origin = 'local' then 'L' else '#' end || lpad(o.number::text, 4, '0'), p_order, 'Sistema (pedidos)');
    end if;
  end loop;
end $$ language plpgsql;

create or replace function orders_stock() returns trigger as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.is_test is not distinct from old.is_test then return null; end if;
  perform stock_apply_order(new.id);
  return null;
end $$ language plpgsql;
drop trigger if exists orders_stock_trg on orders;
create trigger orders_stock_trg after insert or update of status, is_test on orders for each row execute function orders_stock();

-- pedidos sincronizados chegam primeiro sem produtos (os produtos entram logo a seguir)
create or replace function order_items_stock() returns trigger as $$
begin
  perform stock_apply_order(new.order_id);
  return null;
end $$ language plpgsql;
drop trigger if exists order_items_stock_trg on order_items;
create trigger order_items_stock_trg after insert on order_items for each row execute function order_items_stock();
`;

/**
 * Métodos de pagamento: entra "telecel". Os desativados (mtn_momo, card, transfer) continuam permitidos na base de dados
 * porque há pagamentos antigos com eles (imutáveis); a aplicação só deixa escolher Orange Money, Telecel e dinheiro.
 */
export const MIGRATE_PAYMENT_METHODS_SQL = /* sql */ `
select pg_advisory_xact_lock(727014);
alter table payments drop constraint if exists payments_method_check;
alter table payments add constraint payments_method_check check (method in ('cash','orange_money','telecel','mtn_momo','card','transfer'));
`;

/**
 * Desempenho dos relatórios e da Visão geral: filtram os pedidos por data (created_at). Com anos de dados,
 * sem este índice a base de dados teria de ler a tabela inteira em cada relatório.
 */
export const MIGRATE_PERF_SQL = /* sql */ `
select pg_advisory_xact_lock(727015);
create index if not exists orders_created_idx on orders(created_at);
`;

/**
 * Gestão de imagens dos produtos (histórico + originais + falhas). Aditivo: o menu, o POS, a rota
 * /api/menu-image e a sincronização continuam a ler menu_items.image / image_path, como antes.
 *  - menu_item_images: cada versão de imagem de cada produto. O ORIGINAL é guardado tal como foi carregado
 *    (nunca é alterado) e a versão OTIMIZADA (WebP) ao lado. Substituir ou remover NÃO apaga: a versão
 *    anterior fica "replaced"/"removed" e pode ser restaurada. Sem FK com cascata: o histórico sobrevive.
 *  - image_failures: monitorização — imagens que não carregaram no telemóvel do cliente ou na verificação.
 */
export const MIGRATE_IMAGES_SQL = /* sql */ `
select pg_advisory_xact_lock(727016);
create table if not exists menu_item_images (
  id uuid primary key default gen_random_uuid(),
  item_id int not null,
  version int not null,
  source text not null check (source in ('upload','static','legacy','restore')),
  path text,
  original bytea,
  original_type text,
  original_bytes int,
  original_sha256 text,
  optimized bytea,
  optimized_type text,
  optimized_bytes int,
  width int,
  height int,
  sha256 text,
  status text not null default 'current' check (status in ('current','replaced','removed')),
  restored_from uuid,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by text,
  check (path is not null or optimized is not null)
);
create index if not exists menu_item_images_item_idx on menu_item_images(item_id, created_at desc);
create unique index if not exists menu_item_images_current_uq on menu_item_images(item_id) where status = 'current';
create table if not exists image_failures (
  id bigserial primary key,
  item_id int,
  src text not null,
  kind text not null check (kind in ('client_load','server_check')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists image_failures_created_idx on image_failures(created_at desc);
create index if not exists image_failures_item_idx on image_failures(item_id, created_at desc);
-- registo inicial: a imagem ATUAL de cada produto entra no histórico (uma vez)
insert into menu_item_images (item_id, version, source, optimized, optimized_type, optimized_bytes, sha256, note, created_by)
select i.id, i.image_version, 'legacy', i.image, i.image_type, length(i.image), encode(sha256(i.image), 'hex'),
       'Imagem existente antes do histórico: o ficheiro original não foi guardado na altura.', 'sistema'
from menu_items i
where i.image is not null and not exists (select 1 from menu_item_images h where h.item_id = i.id and h.status = 'current');
insert into menu_item_images (item_id, version, source, path, note, created_by)
select i.id, i.image_version, 'static', i.image_path, 'Imagem ilustrativa (ficheiro do site).', 'sistema'
from menu_items i
where i.image is null and i.image_path is not null and not exists (select 1 from menu_item_images h where h.item_id = i.id and h.status = 'current');
`;
