create table if not exists reports_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists reports_domain_service_entries (
  company_id text not null,
  id text not null,
  project_id text not null,
  service_order_id text not null default '',
  appointment_id text not null default '',
  type text not null default 'Relatório de serviço',
  technician text not null,
  responsible text not null,
  report_date text not null,
  status text not null default 'Pendente',
  execution text not null,
  tests text not null default '',
  pending text not null default '',
  next_action_date text not null default '',
  media text not null default '[]',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists reports_domain_delivery_entries (
  company_id text not null,
  id text not null,
  project_id text not null,
  status text not null default 'Aceite pendente',
  delivery_date text not null,
  responsible text not null,
  acceptance text not null default 'Aceite pendente',
  note text not null,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id),
  unique (company_id, project_id)
);

create index if not exists reports_domain_service_entries_project_idx
  on reports_domain_service_entries (company_id, project_id, report_date desc);
create index if not exists reports_domain_delivery_entries_project_idx
  on reports_domain_delivery_entries (company_id, project_id, delivery_date desc);

insert into reports_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(reports_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'date', item->>'projectId') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'serviceReports') = 'array' then s.data->'serviceReports' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into reports_domain_service_entries (
  company_id, id, project_id, service_order_id, appointment_id, type, technician, responsible, report_date, status,
  execution, tests, pending, next_action_date, media, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-report-' || position::text),
       coalesce(item->>'projectId', ''),
       coalesce(item->>'serviceOrderId', ''),
       coalesce(item->>'appointmentId', ''),
       coalesce(nullif(item->>'type', ''), 'Relatório de serviço'),
       coalesce(nullif(item->>'technician', ''), item->>'responsible', ''),
       coalesce(nullif(item->>'responsible', ''), item->>'technician', ''),
       coalesce(item->>'date', ''),
       coalesce(nullif(item->>'status', ''), 'Pendente'),
       coalesce(item->>'execution', ''),
       coalesce(item->>'tests', ''),
       coalesce(item->>'pending', ''),
       coalesce(item->>'nextActionDate', ''),
       coalesce(item->>'media', '[]'),
       item - 'id' - 'projectId' - 'serviceOrderId' - 'appointmentId' - 'type' - 'technician' - 'responsible' - 'date' - 'status' - 'execution' - 'tests' - 'pending' - 'nextActionDate' - 'media'
from source_entries
on conflict (company_id, id) do nothing;

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'date', item->>'projectId') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'projectDeliveries') = 'array' then s.data->'projectDeliveries' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into reports_domain_delivery_entries (
  company_id, id, project_id, status, delivery_date, responsible, acceptance, note, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-delivery-' || position::text),
       coalesce(item->>'projectId', ''),
       coalesce(nullif(item->>'status', ''), item->>'acceptance', 'Pendente'),
       coalesce(item->>'date', item->>'deliveredAt', item->>'acceptedAt', ''),
       coalesce(item->>'responsible', ''),
       coalesce(nullif(item->>'acceptance', ''), item->>'status', 'Aceite pendente'),
       coalesce(item->>'note', ''),
       item - 'id' - 'projectId' - 'status' - 'date' - 'deliveredAt' - 'acceptedAt' - 'responsible' - 'acceptance' - 'note'
from source_entries
where coalesce(item->>'projectId', '') <> ''
on conflict (company_id, project_id) do nothing;
