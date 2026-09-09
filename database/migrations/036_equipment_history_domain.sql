create table if not exists equipment_domain_history (
  company_id text not null,
  id text not null,
  equipment_id text not null default '',
  client_id text not null default '',
  project_id text not null default '',
  history_date text not null default '',
  type text not null default 'Registro tecnico',
  note text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists equipment_domain_history_equipment_idx
  on equipment_domain_history (company_id, equipment_id, updated_at desc, history_date desc);

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'date', item->>'note') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'equipmentHistory') = 'array' then s.data->'equipmentHistory' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into equipment_domain_history (company_id, id, equipment_id, client_id, project_id, history_date, type, note, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-equipment-history-' || position::text),
       coalesce(item->>'equipmentId', ''),
       coalesce(item->>'clientId', ''),
       coalesce(item->>'projectId', ''),
       coalesce(item->>'date', ''),
       coalesce(nullif(item->>'type', ''), 'Registro tecnico'),
       coalesce(item->>'note', ''),
       item - 'id' - 'equipmentId' - 'clientId' - 'projectId' - 'date' - 'type' - 'note'
from source_entries
on conflict (company_id, id) do nothing;
