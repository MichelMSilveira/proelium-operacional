create table if not exists quotes_domain_packages (
  company_id text not null,
  id text not null,
  name text not null default 'Pacote sem nome',
  category text not null default '',
  description text not null default '',
  active boolean not null default true,
  items jsonb not null default '[]'::jsonb,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists quotes_domain_packages_company_idx
  on quotes_domain_packages (company_id, updated_at desc, name asc);

create table if not exists quotes_domain_procurement_requests (
  company_id text not null,
  id text not null,
  quote_id text not null default '',
  room_id text not null default '',
  product_id text not null default '',
  name text not null default 'Item a cotar',
  category text not null default 'A cotar',
  brand text not null default '',
  status text not null default 'A cotar',
  request_date text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists quotes_domain_procurement_quote_idx
  on quotes_domain_procurement_requests (company_id, quote_id, room_id, updated_at desc);

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'packages') = 'array' then s.data->'packages' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into quotes_domain_packages (company_id, id, name, category, description, active, items, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-package-' || position::text),
       coalesce(nullif(item->>'name', ''), 'Pacote sem nome'),
       coalesce(item->>'category', ''),
       coalesce(item->>'description', ''),
       case when item->>'active' = 'false' then false else true end,
       case when jsonb_typeof(item->'items') = 'array' then item->'items' else '[]'::jsonb end,
       item - 'id' - 'name' - 'category' - 'description' - 'active' - 'items'
from source_entries
on conflict (company_id, id) do nothing;

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'procurementRequests') = 'array' then s.data->'procurementRequests' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into quotes_domain_procurement_requests (company_id, id, quote_id, room_id, product_id, name, category, brand, status, request_date, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-procurement-' || position::text),
       coalesce(item->>'quoteId', ''),
       coalesce(item->>'roomId', ''),
       coalesce(item->>'productId', ''),
       coalesce(nullif(item->>'name', ''), 'Item a cotar'),
       coalesce(nullif(item->>'category', ''), 'A cotar'),
       coalesce(item->>'brand', ''),
       coalesce(nullif(item->>'status', ''), 'A cotar'),
       coalesce(item->>'createdAt', ''),
       item - 'id' - 'quoteId' - 'roomId' - 'productId' - 'name' - 'category' - 'brand' - 'status' - 'createdAt'
from source_entries
on conflict (company_id, id) do nothing;
