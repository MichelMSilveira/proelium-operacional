create table if not exists companies (
  id text primary key,
  name text not null,
  document text not null default '',
  created_at timestamptz not null default now()
);

alter table app_users add column if not exists company_id text references companies(id);
alter table app_users add column if not exists email text;
create unique index if not exists app_users_email_idx on app_users(lower(email)) where email is not null and email <> '';
create index if not exists app_users_company_idx on app_users(company_id);

create table if not exists routines (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  periodicity text not null default 'Sem periodicidade',
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routines_company_idx on routines(company_id);
