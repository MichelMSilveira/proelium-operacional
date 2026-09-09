create table if not exists support_tickets_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists support_tickets_domain_entries (
  company_id text not null,
  id text not null,
  opened_at text not null,
  client_id text not null,
  equipment_id text not null default '',
  type text not null default 'Manutenção corretiva',
  priority text not null default 'Média',
  status text not null default 'Aberto',
  description text not null,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists support_tickets_domain_entries_company_idx
  on support_tickets_domain_entries (company_id, updated_at desc, status asc);

insert into support_tickets_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(support_tickets_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'openedAt', item->>'id') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'supportTickets') = 'array' then s.data->'supportTickets' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into support_tickets_domain_entries (
  company_id, id, opened_at, client_id, equipment_id, type, priority, status, description, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-ticket-' || position::text),
       coalesce(nullif(item->>'openedAt', ''), current_date::text),
       coalesce(item->>'clientId', ''),
       coalesce(item->>'equipmentId', ''),
       coalesce(nullif(item->>'type', ''), 'Manutenção corretiva'),
       coalesce(nullif(item->>'priority', ''), 'Média'),
       coalesce(nullif(item->>'status', ''), 'Aberto'),
       coalesce(item->>'description', ''),
       item - 'id' - 'openedAt' - 'clientId' - 'equipmentId' - 'type' - 'priority' - 'status' - 'description'
from source_entries
on conflict (company_id, id) do nothing;
