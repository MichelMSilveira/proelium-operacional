create table if not exists clients_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists clients_domain_entries (
  company_id text not null,
  id text not null,
  name text not null,
  document text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists clients_domain_entries_company_idx
  on clients_domain_entries (company_id, updated_at desc, name asc);

insert into clients_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(clients_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'clients') = 'array' then s.data->'clients' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into clients_domain_entries (company_id, id, name, document, email, phone, address, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-client-' || position::text),
       coalesce(nullif(coalesce(item->>'name', item->>'nome'), ''), 'Cliente sem nome'),
       coalesce(item->>'document', ''),
       coalesce(item->>'email', ''),
       coalesce(item->>'phone', item->>'telefone', ''),
       coalesce(item->>'address', item->>'endereco', ''),
       item - 'id' - 'name' - 'nome' - 'document' - 'email' - 'phone' - 'telefone' - 'address' - 'endereco'
from source_entries
on conflict (company_id, id) do nothing;
