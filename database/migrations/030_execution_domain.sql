create table if not exists execution_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists execution_domain_entries (
  company_id text not null,
  id text not null,
  project_id text not null default '',
  kind text not null default 'Outros gastos',
  date text not null default '',
  person text not null default '',
  quantity text not null default '',
  amount numeric not null default 0 check (amount >= 0),
  description text not null,
  financial_entry_id text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists execution_domain_entries_project_idx
  on execution_domain_entries (company_id, project_id, date desc, updated_at desc);

insert into execution_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(execution_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'date', item->>'description') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'executionEntries') = 'array' then s.data->'executionEntries' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into execution_domain_entries (
  company_id, id, project_id, kind, date, person, quantity, amount, description, financial_entry_id, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-execution-' || position::text),
       coalesce(item->>'projectId', ''),
       coalesce(nullif(item->>'kind', ''), 'Outros gastos'),
       coalesce(item->>'date', ''),
       coalesce(item->>'person', ''),
       coalesce(item->>'quantity', ''),
       case when coalesce(item->>'amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item->>'amount')::numeric else 0 end,
       coalesce(nullif(item->>'description', ''), 'Lancamento sem descricao'),
       coalesce(item->>'financialEntryId', 'legacy-fin-execution-' || position::text),
       item - 'id' - 'projectId' - 'kind' - 'date' - 'person' - 'quantity' - 'amount' - 'description' - 'financialEntryId'
from source_entries
on conflict (company_id, id) do nothing;
