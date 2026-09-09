create table if not exists opportunities_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists opportunities_domain_entries (
  company_id text not null,
  id text not null,
  company text not null default '',
  contact text not null default '',
  phone text not null default '',
  email text not null default '',
  stage text not null default 'Novo contato',
  owner text not null default '',
  source text not null default '',
  next_action text not null default '',
  next_due text not null default '',
  estimated_value numeric not null default 0 check (estimated_value >= 0),
  loss_reason text not null default '',
  interests text not null default '',
  needs text not null default '',
  initial_scope text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists opportunities_domain_stage_idx
  on opportunities_domain_entries (company_id, stage, updated_at desc);

insert into opportunities_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(opportunities_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_entries as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'company', item->>'contact') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'opportunities') = 'array' then s.data->'opportunities' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into opportunities_domain_entries (
  company_id, id, company, contact, phone, email, stage, owner, source, next_action, next_due, estimated_value, loss_reason, interests, needs, initial_scope, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-opportunity-' || position::text),
       coalesce(item->>'company', ''),
       coalesce(item->>'contact', ''),
       coalesce(item->>'phone', ''),
       coalesce(item->>'email', ''),
       coalesce(nullif(item->>'stage', ''), 'Novo contato'),
       coalesce(item->>'owner', ''),
       coalesce(item->>'source', ''),
       coalesce(item->>'nextAction', ''),
       coalesce(item->>'nextDue', ''),
       case when coalesce(item->>'estimatedValue', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item->>'estimatedValue')::numeric else 0 end,
       coalesce(item->>'lossReason', ''),
       coalesce(item->>'interests', ''),
       coalesce(item->>'needs', ''),
       coalesce(item->>'initialScope', ''),
       item - 'id' - 'company' - 'contact' - 'phone' - 'email' - 'stage' - 'owner' - 'source' - 'nextAction' - 'nextDue' - 'estimatedValue' - 'lossReason' - 'interests' - 'needs' - 'initialScope'
from source_entries
on conflict (company_id, id) do nothing;
