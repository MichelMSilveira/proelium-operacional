create table if not exists clients_domain_activities (
  company_id text not null,
  id text not null,
  client_id text not null,
  activity_date text not null default '',
  type text not null default 'Contato',
  title text not null default 'Atividade sem titulo',
  note text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists clients_domain_activities_client_idx
  on clients_domain_activities (company_id, client_id, updated_at desc);

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'title') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'activities') = 'array' then s.data->'activities' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into clients_domain_activities (company_id, id, client_id, activity_date, type, title, note, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-activity-' || position::text),
       coalesce(item->>'clientId', ''),
       coalesce(item->>'date', ''),
       coalesce(nullif(item->>'type', ''), 'Contato'),
       coalesce(nullif(item->>'title', ''), 'Atividade sem titulo'),
       coalesce(item->>'note', ''),
       item - 'id' - 'clientId' - 'date' - 'type' - 'title' - 'note'
from source_entries
on conflict (company_id, id) do nothing;
