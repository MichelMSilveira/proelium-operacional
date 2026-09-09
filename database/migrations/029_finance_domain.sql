create table if not exists finance_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists finance_domain_accounts (
  company_id text not null,
  id text not null,
  name text not null,
  institution text not null default '',
  account_type text not null default 'Corrente',
  initial_balance numeric not null default 0 check (initial_balance >= 0),
  status text not null default 'Ativa',
  notes text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists finance_domain_entries (
  company_id text not null,
  id text not null,
  type text not null default 'Despesa',
  status text not null default 'Realizado',
  amount numeric not null default 0 check (amount >= 0),
  date text not null default '',
  category text not null default 'Sem categoria',
  description text not null,
  responsible text not null default '',
  client_id text not null default '',
  project_id text not null default '',
  account_id text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists finance_domain_entries_date_idx
  on finance_domain_entries (company_id, date desc, updated_at desc, description asc);

create index if not exists finance_domain_entries_project_idx
  on finance_domain_entries (company_id, project_id, updated_at desc);

insert into finance_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(finance_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_accounts as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'financialAccounts') = 'array' then s.data->'financialAccounts' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into finance_domain_accounts (
  company_id, id, name, institution, account_type, initial_balance, status, notes, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-financial-account-' || position::text),
       coalesce(nullif(item->>'name', ''), 'Conta sem nome'),
       coalesce(item->>'institution', ''),
       coalesce(nullif(item->>'type', ''), 'Corrente'),
       case when coalesce(item->>'initialBalance', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item->>'initialBalance')::numeric else 0 end,
       coalesce(nullif(item->>'status', ''), 'Ativa'),
       coalesce(item->>'notes', ''),
       item - 'id' - 'name' - 'institution' - 'type' - 'initialBalance' - 'status' - 'notes'
from source_accounts
on conflict (company_id, id) do nothing;

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'date', item->>'description') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'financialEntries') = 'array' then s.data->'financialEntries' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into finance_domain_entries (
  company_id, id, type, status, amount, date, category, description, responsible, client_id, project_id, account_id, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-financial-entry-' || position::text),
       coalesce(nullif(item->>'type', ''), 'Despesa'),
       coalesce(nullif(item->>'status', ''), 'Realizado'),
       case when coalesce(item->>'amount', item->>'value', item->>'valor', '') ~ '^[0-9]+(\.[0-9]+)?$' then (coalesce(item->>'amount', item->>'value', item->>'valor'))::numeric else 0 end,
       coalesce(item->>'date', ''),
       coalesce(nullif(item->>'category', ''), item->>'categoria', 'Sem categoria'),
       coalesce(nullif(item->>'description', ''), item->>'name', item->>'nome', 'Lancamento sem descricao'),
       coalesce(item->>'responsible', ''),
       coalesce(item->>'clientId', ''),
       coalesce(item->>'projectId', ''),
       coalesce(item->>'accountId', ''),
       item - 'id' - 'type' - 'status' - 'amount' - 'value' - 'valor' - 'date' - 'category' - 'categoria' - 'description' - 'name' - 'nome' - 'responsible' - 'clientId' - 'projectId' - 'accountId'
from source_entries
on conflict (company_id, id) do nothing;
