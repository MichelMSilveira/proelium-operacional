create table if not exists purchases_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists purchases_domain_entries (
  company_id text not null,
  id text not null,
  project_id text not null,
  source_key text not null default '',
  room text not null default '',
  product_id text not null default '',
  name text not null,
  qty numeric not null check (qty > 0),
  unit text not null default 'un',
  status text not null default 'Planejado',
  supplier text not null default '',
  note text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists purchases_domain_entries_project_idx
  on purchases_domain_entries (company_id, project_id, updated_at desc, name asc);

insert into purchases_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(purchases_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'projectId', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'purchaseItems') = 'array' then s.data->'purchaseItems' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into purchases_domain_entries (
  company_id, id, project_id, source_key, room, product_id, name, qty, unit, status, supplier, note, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-purchase-' || position::text),
       coalesce(item->>'projectId', ''),
       coalesce(item->>'sourceKey', ''),
       coalesce(item->>'room', ''),
       coalesce(item->>'productId', ''),
       coalesce(nullif(item->>'name', ''), item->>'description', item->>'nome', 'Material sem nome'),
       case when coalesce(item->>'qty', item->>'quantity', item->>'quantidade') ~ '^[0-9]+(\.[0-9]+)?$'
                  and (coalesce(item->>'qty', item->>'quantity', item->>'quantidade'))::numeric > 0
            then (coalesce(item->>'qty', item->>'quantity', item->>'quantidade'))::numeric
            else 1 end,
       coalesce(item->>'unit', 'un'),
       coalesce(nullif(item->>'status', ''), 'Planejado'),
       coalesce(nullif(item->>'supplier', ''), item->>'fornecedor', ''),
       coalesce(nullif(item->>'note', ''), item->>'observation', ''),
       item - 'id' - 'projectId' - 'sourceKey' - 'room' - 'productId' - 'name' - 'description' - 'nome' - 'qty' - 'quantity' - 'quantidade' - 'unit' - 'status' - 'supplier' - 'fornecedor' - 'note' - 'observation'
from source_entries
on conflict (company_id, id) do nothing;
