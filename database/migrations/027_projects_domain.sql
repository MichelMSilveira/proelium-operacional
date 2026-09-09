create table if not exists projects_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists projects_domain_entries (
  company_id text not null,
  id text not null,
  name text not null,
  client_id text not null default '',
  technical_stage text not null default 'Projeto técnico',
  status text not null default 'Planejamento',
  manager text not null default '',
  progress numeric not null default 0 check (progress >= 0 and progress <= 100),
  budget numeric not null default 0 check (budget >= 0),
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists projects_domain_entries_company_idx
  on projects_domain_entries (company_id, updated_at desc, name asc);

insert into projects_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(projects_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'projects') = 'array' then s.data->'projects' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into projects_domain_entries (
  company_id, id, name, client_id, technical_stage, status, manager, progress, budget, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-project-' || position::text),
       coalesce(nullif(item->>'name', ''), item->>'nome', 'Projeto sem nome'),
       coalesce(item->>'clientId', ''),
       coalesce(nullif(item->>'technicalStage', ''), 'Projeto técnico'),
       coalesce(nullif(item->>'status', ''), 'Planejamento'),
       coalesce(item->>'manager', ''),
       case when item->>'progress' ~ '^-?[0-9]+(\.[0-9]+)?$' then greatest(0, least(100, (item->>'progress')::numeric)) else 0 end,
       case when item->>'budget' ~ '^-?[0-9]+(\.[0-9]+)?$' then greatest(0, (item->>'budget')::numeric) else 0 end,
       item - 'id' - 'name' - 'nome' - 'clientId' - 'technicalStage' - 'status' - 'manager' - 'progress' - 'budget'
from source_entries
on conflict (company_id, id) do nothing;
