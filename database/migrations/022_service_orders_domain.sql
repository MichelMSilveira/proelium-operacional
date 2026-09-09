create table if not exists service_orders_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists service_orders_domain_entries (
  company_id text not null,
  id text not null,
  code text not null,
  client_id text not null,
  project_id text not null default '',
  equipment_id text not null default '',
  type text not null default 'Visita técnica',
  order_date text not null,
  order_time text not null default '',
  assignee text not null default '',
  status text not null default 'Agendada',
  description text not null,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists service_orders_domain_entries_schedule_idx
  on service_orders_domain_entries (company_id, order_date desc, updated_at desc);

insert into service_orders_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(service_orders_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'date', item->>'code') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'serviceOrders') = 'array' then s.data->'serviceOrders' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into service_orders_domain_entries (
  company_id, id, code, client_id, project_id, equipment_id, type, order_date, order_time, assignee, status, description, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-service-order-' || position::text),
       coalesce(nullif(item->>'code', ''), 'OS-' || lpad((1000 + position)::text, 4, '0')),
       coalesce(item->>'clientId', ''),
       coalesce(item->>'projectId', ''),
       coalesce(item->>'equipmentId', ''),
       coalesce(nullif(item->>'type', ''), 'Visita técnica'),
       coalesce(item->>'date', ''),
       coalesce(item->>'time', ''),
       coalesce(nullif(item->>'assignee', ''), item->>'responsible', ''),
       coalesce(nullif(item->>'status', ''), 'Agendada'),
       coalesce(nullif(item->>'description', ''), 'Escopo nao informado'),
       item - 'id' - 'code' - 'clientId' - 'projectId' - 'equipmentId' - 'type' - 'date' - 'time' - 'assignee' - 'responsible' - 'status' - 'description'
from source_entries
on conflict (company_id, id) do nothing;
