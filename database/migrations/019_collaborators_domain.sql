create table if not exists collaborators_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists collaborators_domain_entries (
  company_id text not null,
  id text not null,
  name text not null,
  role text not null,
  specialty text not null default '',
  relationship text not null default '',
  availability text not null default '',
  compensation text not null default '',
  status text not null default 'Ativo',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists collaborators_domain_entries_company_idx
  on collaborators_domain_entries (company_id, updated_at desc, name asc);

insert into collaborators_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(collaborators_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'collaborators') = 'array' then s.data->'collaborators' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into collaborators_domain_entries (
  company_id, id, name, role, specialty, relationship, availability, compensation, status, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-collaborator-' || position::text),
       coalesce(nullif(item->>'name', ''), 'Colaborador sem nome'),
       coalesce(item->>'role', ''),
       coalesce(item->>'specialty', ''),
       coalesce(item->>'relationship', ''),
       coalesce(item->>'availability', ''),
       coalesce(item->>'compensation', ''),
       coalesce(nullif(item->>'status', ''), 'Ativo'),
       item - 'id' - 'name' - 'role' - 'specialty' - 'relationship' - 'availability' - 'compensation' - 'status'
from source_entries
on conflict (company_id, id) do nothing;
