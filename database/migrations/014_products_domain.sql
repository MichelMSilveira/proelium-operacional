create table if not exists products_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists products_domain_entries (
  company_id text not null,
  id text not null,
  catalog_type text not null default 'product' check (catalog_type in ('product', 'service')),
  name text not null,
  sku text not null default '',
  category text not null default '',
  unit text not null default 'un',
  price numeric(14,2) not null default 0 check (price >= 0),
  active boolean not null default true,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists products_domain_entries_company_idx
  on products_domain_entries (company_id, catalog_type, updated_at desc, name asc);

insert into products_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(products_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'products') = 'array' then s.data->'products' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into products_domain_entries (
  company_id, id, catalog_type, name, sku, category, unit, price, active, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-product-' || position::text),
       case
         when lower(coalesce(item->>'catalogType', '')) = 'service'
           or lower(coalesce(item->>'mode', '')) = 'servico'
           or lower(coalesce(item->>'unit', item->>'unidade', '')) in ('h', 'mes', 'diaria', 'visita')
         then 'service'
         else 'product'
       end,
       coalesce(nullif(coalesce(item->>'name', item->>'nome'), ''), 'Produto sem nome'),
       coalesce(item->>'sku', ''),
       coalesce(item->>'category', ''),
       coalesce(nullif(coalesce(item->>'unit', item->>'unidade'), ''), 'un'),
       case when (item->>'price') ~ '^[0-9]+(\.[0-9]+)?$' then (item->>'price')::numeric else 0 end,
       case when lower(coalesce(item->>'active', 'true')) in ('false', '0', 'no') then false else true end,
       item - 'id' - 'catalogType' - 'name' - 'nome' - 'sku' - 'category' - 'unit' - 'unidade' - 'price' - 'active'
from source_entries
on conflict (company_id, id) do nothing;
