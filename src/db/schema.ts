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
alter table admin_users add constraint admin_users_role_check check (role in ('admin','gerente'));
alter table admin_users alter column role set default 'gerente';
`;

/** Fotografia por ficheiro estático (/menu/xxx.webp) e nota "a confirmar" pelo gerente. Idempotente. */
export const MIGRATE_MENU_SQL = /* sql */ `
alter table menu_items add column if not exists image_path text;
alter table menu_items add column if not exists review_note text;
`;
