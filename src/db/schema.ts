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
