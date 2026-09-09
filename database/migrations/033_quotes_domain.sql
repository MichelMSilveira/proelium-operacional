create table if not exists quotes_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists quotes_domain_entries (
  company_id text not null,
  id text not null,
  opportunity_id text not null default '',
  client_id text not null default '',
  title text not null default 'Orcamento sem titulo',
  status text not null default 'Em elaboracao',
  value numeric not null default 0 check (value >= 0),
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists quotes_domain_entries_opportunity_idx
  on quotes_domain_entries (company_id, opportunity_id, updated_at desc);

create table if not exists quotes_domain_rooms (
  company_id text not null,
  id text not null,
  quote_id text not null,
  name text not null default 'Ambiente sem nome',
  items jsonb not null default '[]'::jsonb,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists quotes_domain_rooms_quote_idx
  on quotes_domain_rooms (company_id, quote_id, name asc);

insert into quotes_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(quotes_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_quotes as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'title') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'quotes') = 'array' then s.data->'quotes' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into quotes_domain_entries (company_id, id, opportunity_id, client_id, title, status, value, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-quote-' || position::text),
       coalesce(item->>'opportunityId', ''),
       coalesce(item->>'clientId', ''),
       coalesce(nullif(item->>'title', ''), item->>'name', 'Orcamento sem titulo'),
       coalesce(nullif(item->>'status', ''), 'Em elaboracao'),
       case when coalesce(item->>'value', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item->>'value')::numeric else 0 end,
       item - 'id' - 'opportunityId' - 'clientId' - 'title' - 'name' - 'status' - 'value'
from source_quotes
on conflict (company_id, id) do nothing;

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_rooms as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'quoteId', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'quoteRooms') = 'array' then s.data->'quoteRooms' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into quotes_domain_rooms (company_id, id, quote_id, name, items, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-room-' || position::text),
       coalesce(item->>'quoteId', ''),
       coalesce(nullif(item->>'name', ''), 'Ambiente sem nome'),
       case when jsonb_typeof(item->'items') = 'array' then item->'items' else '[]'::jsonb end,
       item - 'id' - 'quoteId' - 'name' - 'items'
from source_rooms
on conflict (company_id, id) do nothing;
