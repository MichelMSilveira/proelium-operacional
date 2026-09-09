create table if not exists equipment_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists equipment_domain_entries (
  company_id text not null,
  id text not null,
  name text not null,
  manufacturer text not null default '',
  model text not null default '',
  serial_number text not null default '',
  location text not null default '',
  status text not null default 'Sem status informado',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists equipment_domain_entries_company_idx
  on equipment_domain_entries (company_id, updated_at desc, name asc);

insert into equipment_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(equipment_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'equipment') = 'array' then s.data->'equipment' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into equipment_domain_entries (
  company_id, id, name, manufacturer, model, serial_number, location, status, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-equipment-' || position::text),
       coalesce(nullif(coalesce(item->>'name', item->>'nome', item->>'model'), ''), 'Equipamento ' || position::text),
       coalesce(item->>'manufacturer', item->>'brand', item->>'fabricante', ''),
       coalesce(item->>'model', item->>'modelo', ''),
       coalesce(item->>'serialNumber', item->>'serial', item->>'numeroSerie', ''),
       coalesce(item->>'location', item->>'localizacao', item->>'local', ''),
       coalesce(nullif(item->>'status', ''), 'Sem status informado'),
       item - 'id' - 'name' - 'nome' - 'manufacturer' - 'brand' - 'fabricante' - 'model' - 'modelo' - 'serialNumber' - 'serial' - 'numeroSerie' - 'location' - 'localizacao' - 'local' - 'status'
from source_entries
on conflict (company_id, id) do nothing;
