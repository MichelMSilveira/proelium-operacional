-- PostgreSQL 16+. Valores monetários são inteiros em centavos.
create extension if not exists pgcrypto;

create type record_status as enum ('active', 'inactive', 'archived');
create type project_status as enum ('planning', 'approved', 'in_progress', 'blocked', 'testing', 'completed', 'cancelled');
create type task_status as enum ('open', 'in_progress', 'blocked', 'done', 'cancelled');
create type priority_level as enum ('low', 'medium', 'high', 'urgent');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  email text not null,
  role text not null,
  status record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  legal_name text not null,
  trade_name text,
  tax_id text,
  email text,
  phone text,
  status record_status not null default 'active',
  owner_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  label text not null,
  street text not null,
  number text,
  city text not null,
  state text not null,
  postal_code text,
  notes text
);

create table process_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  version integer not null default 1,
  active boolean not null default true
);

create table process_steps (
  id uuid primary key default gen_random_uuid(),
  process_template_id uuid not null references process_templates(id),
  name text not null,
  position integer not null,
  default_due_days integer,
  unique (process_template_id, position)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  client_id uuid not null references clients(id),
  process_template_id uuid references process_templates(id),
  manager_id uuid references users(id),
  code text not null,
  name text not null,
  description text,
  status project_status not null default 'planning',
  technical_stage text not null default 'Projeto técnico' check (technical_stage in ('Projeto técnico', 'Cabeamento', 'Instalação')),
  current_step_id uuid references process_steps(id),
  start_date date,
  due_date date,
  approved_cents bigint not null default 0,
  estimated_cost_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid references projects(id),
  client_id uuid references clients(id),
  assignee_id uuid references users(id),
  title text not null,
  description text,
  status task_status not null default 'open',
  priority priority_level not null default 'medium',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  client_id uuid not null references clients(id),
  owner_id uuid references users(id),
  title text not null,
  stage text not null,
  expected_cents bigint not null default 0,
  probability integer check (probability between 0 and 100),
  expected_close_date date
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id),
  project_id uuid references projects(id),
  version integer not null default 1,
  status text not null default 'draft',
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  total_cents bigint not null default 0,
  valid_until date,
  approved_at timestamptz
);

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  sku text not null,
  name text not null,
  brand text,
  category text not null,
  provision_mode text not null check (provision_mode in ('sale', 'provided', 'sale_or_provided', 'service')),
  unit text not null,
  cost_cents bigint not null default 0,
  price_cents bigint not null default 0,
  active boolean not null default true,
  unique (organization_id, sku)
);

create table quote_rooms (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id),
  name text not null,
  position integer not null default 1
);

create table quote_room_items (
  id uuid primary key default gen_random_uuid(),
  quote_room_id uuid not null references quote_rooms(id),
  product_id uuid not null references products(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost_cents bigint not null,
  unit_price_cents bigint not null,
  discount_cents bigint not null default 0
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  address_id uuid references addresses(id),
  assigned_to uuid references users(id),
  code text not null,
  status text not null default 'scheduled',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  execution_notes text,
  unique (project_id, code)
);

create table financial_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid references projects(id),
  quote_id uuid references quotes(id),
  kind text not null check (kind in ('income', 'expense')),
  category text not null,
  description text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  client_id uuid references clients(id),
  project_id uuid references projects(id),
  name text not null,
  brand text,
  model text,
  serial_number text,
  status text not null,
  installed_at date,
  warranty_until date,
  next_maintenance_at date
);

create table installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  client_id uuid not null references clients(id),
  project_id uuid not null references projects(id),
  address_id uuid references addresses(id),
  technical_lead_id uuid references users(id),
  installation_type text not null,
  stage text not null default 'planning',
  status text not null default 'planning',
  progress smallint not null default 0 check (progress between 0 and 100),
  due_date date,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table client_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  client_id uuid not null references clients(id),
  project_id uuid references projects(id),
  author_id uuid references users(id),
  activity_type text not null,
  subject text not null,
  details text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  author_id uuid references users(id),
  title text not null,
  summary text,
  content text not null,
  tags text[] not null default '{}',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  actor_id uuid,
  actor_type text not null check (actor_type in ('user', 'service', 'nemo')),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

create index projects_client_idx on projects(client_id);
create index tasks_project_status_idx on tasks(project_id, status);
create index tasks_due_idx on tasks(due_at) where status not in ('done', 'cancelled');
create index transactions_project_idx on financial_transactions(project_id);
create index quote_rooms_quote_idx on quote_rooms(quote_id);
create index quote_room_items_room_idx on quote_room_items(quote_room_id);
create index equipment_client_idx on equipment(client_id);
create index installations_client_idx on installations(client_id, status);
create index client_activities_timeline_idx on client_activities(client_id, occurred_at desc);
create index knowledge_search_idx on knowledge_articles using gin (to_tsvector('portuguese', title || ' ' || content));
