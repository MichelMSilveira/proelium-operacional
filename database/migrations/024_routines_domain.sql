create table if not exists routines_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

insert into routines_domain_state (company_id, revision)
select company_id, 0
from routines
group by company_id
on conflict (company_id) do nothing;

insert into routines_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end, 0
from app_state
on conflict (company_id) do nothing;
