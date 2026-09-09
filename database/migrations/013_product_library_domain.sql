create table if not exists product_library_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists product_library_domain_entries (
  company_id text not null,
  id text not null,
  name text not null,
  areas text not null default '',
  source text not null default '',
  status text not null default 'Fonte oficial a consultar',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists product_library_domain_entries_company_idx
  on product_library_domain_entries (company_id, updated_at desc, name asc);

insert into product_library_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(product_library_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'manufacturerLibrary') = 'array' then s.data->'manufacturerLibrary' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into product_library_domain_entries (company_id, id, name, areas, source, status, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-manufacturer-' || position::text),
       coalesce(nullif(item->>'name', ''), 'Fabricante sem nome'),
       coalesce(item->>'areas', item->>'category', ''),
       coalesce(item->>'source', ''),
       coalesce(nullif(item->>'status', ''), 'Fonte oficial a consultar'),
       item - 'id' - 'name' - 'areas' - 'category' - 'source' - 'status'
from source_entries
on conflict (company_id, id) do nothing;
