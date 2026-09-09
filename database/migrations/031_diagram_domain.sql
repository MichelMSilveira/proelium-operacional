create table if not exists diagram_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists diagram_domain_connections (
  company_id text not null,
  id text not null,
  project_id text not null default '',
  from_id text not null default '',
  from_label text not null default 'Origem externa',
  from_port text not null default 'Saida a confirmar',
  to_id text not null default '',
  to_label text not null default 'Destino a confirmar',
  to_port text not null default 'Entrada a confirmar',
  cable text not null default 'Cabo a confirmar',
  status text not null default 'Proposto - confirmar',
  cable_count integer not null default 1 check (cable_count > 0),
  origin text not null default 'Manual Proelium',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists diagram_domain_connections_project_idx
  on diagram_domain_connections (company_id, project_id, updated_at desc);

create table if not exists diagram_domain_aux_records (
  company_id text not null,
  kind text not null check (kind in ('edit', 'override')),
  id text not null,
  record_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, kind, id)
);

insert into diagram_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(diagram_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_connections as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'projectId', item->>'fromId', item->>'toId') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'technicalConnections') = 'array' then s.data->'technicalConnections' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into diagram_domain_connections (
  company_id, id, project_id, from_id, from_label, from_port, to_id, to_label, to_port, cable, status, cable_count, origin, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-connection-' || position::text),
       coalesce(item->>'projectId', ''),
       coalesce(item->>'fromId', ''),
       coalesce(nullif(item->>'fromLabel', ''), 'Origem externa'),
       coalesce(nullif(item->>'fromPort', ''), 'Saida a confirmar'),
       coalesce(item->>'toId', ''),
       coalesce(nullif(item->>'toLabel', ''), 'Destino a confirmar'),
       coalesce(nullif(item->>'toPort', ''), 'Entrada a confirmar'),
       coalesce(nullif(item->>'cable', ''), 'Cabo a confirmar'),
       coalesce(nullif(item->>'status', ''), 'Proposto - confirmar'),
       case when item->>'cableCount' ~ '^[0-9]+$' and (item->>'cableCount')::integer > 0 then (item->>'cableCount')::integer else 1 end,
       coalesce(nullif(item->>'origin', ''), 'Manual Proelium'),
       item - 'id' - 'projectId' - 'fromId' - 'fromLabel' - 'fromPort' - 'toId' - 'toLabel' - 'toPort' - 'cable' - 'status' - 'cableCount' - 'origin'
from source_connections
on conflict (company_id, id) do nothing;

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_aux as (
  select s.company_id, 'edit' as kind, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'connectionId') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'technicalConnectionEdits') = 'array' then s.data->'technicalConnectionEdits' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into diagram_domain_aux_records (company_id, kind, id, record_data)
select company_id, kind, coalesce(nullif(item->>'id', ''), 'legacy-diagram-edit-' || position::text), item
from source_aux
on conflict (company_id, kind, id) do nothing;

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_aux as (
  select s.company_id, 'override' as kind, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'connectionId') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'technicalConnectionOverrides') = 'array' then s.data->'technicalConnectionOverrides' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into diagram_domain_aux_records (company_id, kind, id, record_data)
select company_id, kind, coalesce(nullif(item->>'id', ''), 'legacy-diagram-override-' || position::text), item
from source_aux
on conflict (company_id, kind, id) do nothing;
