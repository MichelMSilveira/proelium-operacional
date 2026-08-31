-- Preparação para futura conciliação bancária. Não armazena credenciais bancárias.
create table if not exists financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  name text not null,
  institution_name text,
  account_type text not null default 'checking' check (account_type in ('checking', 'savings', 'cash', 'other')),
  currency char(3) not null default 'BRL',
  provider text,
  external_account_id text,
  connection_status text not null default 'manual' check (connection_status in ('manual', 'connected', 'revoked', 'error')),
  last_synced_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_account_id)
);

create table if not exists financial_external_transactions (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references financial_accounts(id),
  external_transaction_id text not null,
  occurred_at timestamptz not null,
  description text not null,
  amount_cents bigint not null,
  direction text not null check (direction in ('credit', 'debit')),
  raw_category text,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending', 'matched', 'ignored')),
  -- Mantido como UUID sem FK enquanto o runtime usa o estado JSON; a FK entra na migração relacional completa.
  matched_transaction_id uuid,
  imported_at timestamptz not null default now(),
  unique (financial_account_id, external_transaction_id)
);

create index if not exists financial_external_transactions_date_idx
  on financial_external_transactions (financial_account_id, occurred_at desc);
