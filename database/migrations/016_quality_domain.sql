create table if not exists quality_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists quality_domain_evaluations (
  company_id text not null,
  id text not null,
  project_id text not null,
  source text not null default 'Interna' check (source in ('Interna', 'Cliente')),
  evaluator text not null,
  collaborator text not null,
  installation integer not null check (installation between 1 and 5),
  service integer not null check (service between 1 and 5),
  commitment integer not null check (commitment between 1 and 5),
  deadline integer not null check (deadline between 1 and 5),
  note text not null default '',
  evaluation_date date not null default current_date,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists quality_domain_evaluations_company_idx
  on quality_domain_evaluations (company_id, evaluation_date desc, created_at desc);

insert into quality_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(quality_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'date', item->>'id') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'evaluations') = 'array' then s.data->'evaluations' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into quality_domain_evaluations (
  company_id, id, project_id, source, evaluator, collaborator, installation, service, commitment, deadline, note, evaluation_date, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-evaluation-' || position::text),
       coalesce(item->>'projectId', ''),
       case when item->>'source' = 'Cliente' then 'Cliente' else 'Interna' end,
       coalesce(item->>'evaluator', ''),
       coalesce(item->>'collaborator', ''),
       greatest(1, least(5, case when (item->>'installation') ~ '^[0-9]+$' then (item->>'installation')::integer else 1 end)),
       greatest(1, least(5, case when (item->>'service') ~ '^[0-9]+$' then (item->>'service')::integer else 1 end)),
       greatest(1, least(5, case when (item->>'commitment') ~ '^[0-9]+$' then (item->>'commitment')::integer else 1 end)),
       greatest(1, least(5, case when (item->>'deadline') ~ '^[0-9]+$' then (item->>'deadline')::integer else 1 end)),
       coalesce(item->>'note', ''),
       case when (item->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (item->>'date')::date else current_date end,
       item - 'id' - 'projectId' - 'source' - 'evaluator' - 'collaborator' - 'installation' - 'service' - 'commitment' - 'deadline' - 'note' - 'date'
from source_entries
on conflict (company_id, id) do nothing;
