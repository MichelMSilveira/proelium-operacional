create table if not exists installations_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists installations_domain_entries (
  company_id text not null,
  id text not null,
  client_id text not null,
  project_id text not null,
  type text not null default 'Instalação',
  site text not null,
  lead text not null,
  stage text not null default 'Planejamento',
  progress integer not null default 0 check (progress between 0 and 100),
  due text not null default '',
  status text not null default 'Planejamento',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists installations_domain_entries_company_idx
  on installations_domain_entries (company_id, due asc, updated_at desc);

insert into installations_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(installations_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'projectId') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'installations') = 'array' then s.data->'installations' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into installations_domain_entries (
  company_id, id, client_id, project_id, type, site, lead, stage, progress, due, status, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-installation-' || position::text),
       coalesce(item->>'clientId', ''),
       coalesce(item->>'projectId', ''),
       coalesce(nullif(item->>'type', ''), 'Instalação'),
       coalesce(item->>'site', ''),
       coalesce(item->>'lead', ''),
       coalesce(nullif(item->>'stage', ''), 'Planejamento'),
       case when item->>'progress' ~ '^-?[0-9]+$' then greatest(0, least(100, (item->>'progress')::integer)) else 0 end,
       coalesce(item->>'due', ''),
       coalesce(nullif(item->>'status', ''), 'Planejamento'),
       item - 'id' - 'clientId' - 'projectId' - 'type' - 'site' - 'lead' - 'stage' - 'progress' - 'due' - 'status'
from source_entries
on conflict (company_id, id) do nothing;
