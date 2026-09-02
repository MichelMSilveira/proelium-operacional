create table if not exists company_invites (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  token_hash text not null unique,
  email text,
  role text not null default 'operacao',
  modules jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists company_invites_active_idx on company_invites (company_id, expires_at) where used_at is null;

alter table companies add column if not exists access_level text not null default 'limited';
alter table companies add column if not exists modules jsonb not null default '["dashboard","knowledge"]'::jsonb;
alter table companies add column if not exists admin_notes text not null default '';
alter table companies add column if not exists reviewed_at timestamptz;
