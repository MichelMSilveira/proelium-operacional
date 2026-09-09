create table if not exists project_checklists_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists project_checklists_domain_entries (
  company_id text not null,
  id text not null,
  project_id text not null,
  title text not null,
  phase text not null default 'Projeto técnico',
  done boolean not null default false,
  standard boolean not null default false,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists project_checklists_domain_entries_project_idx
  on project_checklists_domain_entries (company_id, project_id, phase, title);

insert into project_checklists_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(project_checklists_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'projectId', item->>'title') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'projectChecklists') = 'array' then s.data->'projectChecklists' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into project_checklists_domain_entries (
  company_id, id, project_id, title, phase, done, standard, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-checklist-' || position::text),
       coalesce(item->>'projectId', ''),
       coalesce(nullif(item->>'title', ''), item->>'name', 'Verificação sem título'),
       coalesce(nullif(item->>'phase', ''), 'Projeto técnico'),
       lower(coalesce(item->>'done', 'false')) = 'true',
       lower(coalesce(item->>'standard', 'false')) = 'true',
       item - 'id' - 'projectId' - 'title' - 'name' - 'phase' - 'done' - 'standard'
from source_entries
on conflict (company_id, id) do nothing;
