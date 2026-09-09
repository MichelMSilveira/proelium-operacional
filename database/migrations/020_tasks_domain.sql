create table if not exists tasks_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists tasks_domain_entries (
  company_id text not null,
  id text not null,
  title text not null,
  project_id text not null,
  responsible text not null default '',
  due text not null default '',
  task_time text not null default '',
  status text not null default 'Aberta',
  priority text not null default 'Média',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists tasks_domain_entries_company_idx
  on tasks_domain_entries (company_id, updated_at desc, title asc);

insert into tasks_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(tasks_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'title') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'tasks') = 'array' then s.data->'tasks' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into tasks_domain_entries (
  company_id, id, title, project_id, responsible, due, task_time, status, priority, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-task-' || position::text),
       coalesce(nullif(item->>'title', ''), 'Tarefa sem titulo'),
       coalesce(item->>'projectId', ''),
       coalesce(nullif(item->>'responsible', ''), item->>'assignee', ''),
       coalesce(item->>'due', ''),
       coalesce(item->>'time', ''),
       coalesce(nullif(item->>'status', ''), 'Aberta'),
       coalesce(nullif(item->>'priority', ''), 'Média'),
       item - 'id' - 'title' - 'projectId' - 'responsible' - 'assignee' - 'due' - 'time' - 'status' - 'priority'
from source_entries
on conflict (company_id, id) do nothing;
