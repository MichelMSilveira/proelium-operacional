create table if not exists appointments_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists appointments_domain_entries (
  company_id text not null,
  id text not null,
  title text not null,
  client_id text not null default '',
  project_id text not null default '',
  assignee text not null,
  appointment_date text not null,
  appointment_time text not null default '',
  note text not null default '',
  status text not null default 'Agendado',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists appointments_domain_entries_schedule_idx
  on appointments_domain_entries (company_id, appointment_date asc, appointment_time asc, updated_at desc);

insert into appointments_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(appointments_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'date', item->>'title') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'appointments') = 'array' then s.data->'appointments' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into appointments_domain_entries (
  company_id, id, title, client_id, project_id, assignee, appointment_date, appointment_time, note, status, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-appointment-' || position::text),
       coalesce(nullif(item->>'title', ''), 'Compromisso sem titulo'),
       coalesce(item->>'clientId', ''),
       coalesce(item->>'projectId', ''),
       coalesce(nullif(item->>'assignee', ''), item->>'person', ''),
       coalesce(item->>'date', ''),
       coalesce(item->>'time', ''),
       coalesce(item->>'note', ''),
       coalesce(nullif(item->>'status', ''), 'Agendado'),
       item - 'id' - 'title' - 'clientId' - 'projectId' - 'assignee' - 'person' - 'date' - 'time' - 'note' - 'status'
from source_entries
on conflict (company_id, id) do nothing;
