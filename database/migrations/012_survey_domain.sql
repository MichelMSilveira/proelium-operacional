create table if not exists survey_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists survey_domain_surveys (
  company_id text not null,
  id text not null,
  opportunity_id text not null default '',
  title text not null,
  site text not null default '',
  source text not null default 'Preenchimento manual',
  status text not null default 'Em levantamento',
  notes text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists survey_domain_points (
  company_id text not null,
  id text not null,
  survey_id text not null,
  room text not null default 'Ambiente nao informado',
  room_id text not null default '',
  type text not null,
  technology text not null default '',
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  status text not null default 'Em levantamento',
  notes text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists survey_domain_rooms (
  company_id text not null,
  id text not null,
  survey_id text not null,
  name text not null,
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists survey_domain_surveys_company_idx
  on survey_domain_surveys (company_id, updated_at desc);
create index if not exists survey_domain_points_survey_idx
  on survey_domain_points (company_id, survey_id, updated_at desc);
create index if not exists survey_domain_rooms_survey_idx
  on survey_domain_rooms (company_id, survey_id, updated_at desc);

insert into survey_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(survey_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_surveys as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'title') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'surveys') = 'array' then s.data->'surveys' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into survey_domain_surveys (company_id, id, opportunity_id, title, site, source, status, notes, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-survey-' || position::text),
       coalesce(item->>'opportunityId', ''),
       coalesce(nullif(coalesce(item->>'title', item->>'name'), ''), 'Levantamento sem titulo'),
       coalesce(item->>'site', ''),
       coalesce(nullif(item->>'source', ''), 'Preenchimento manual'),
       coalesce(nullif(item->>'status', ''), 'Em andamento'),
       coalesce(item->>'notes', ''),
       item - 'id' - 'opportunityId' - 'title' - 'name' - 'site' - 'source' - 'status' - 'notes'
from source_surveys
on conflict (company_id, id) do nothing;

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_points as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'type') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'surveyPoints') = 'array' then s.data->'surveyPoints' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into survey_domain_points (company_id, id, survey_id, room, room_id, type, technology, quantity, status, notes, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-survey-point-' || position::text),
       coalesce(item->>'surveyId', ''),
       coalesce(nullif(item->>'room', ''), 'Ambiente nao informado'),
       coalesce(item->>'roomId', ''),
       coalesce(nullif(coalesce(item->>'type', item->>'name'), ''), 'Ponto tecnico'),
       coalesce(item->>'technology', ''),
       case when (item->>'quantity') ~ '^[0-9]+(\.[0-9]+)?$' then (item->>'quantity')::numeric else 0 end,
       coalesce(nullif(item->>'status', ''), 'Em levantamento'),
       coalesce(item->>'notes', ''),
       item - 'id' - 'surveyId' - 'room' - 'roomId' - 'type' - 'name' - 'technology' - 'quantity' - 'status' - 'notes'
from source_points
on conflict (company_id, id) do nothing;

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_rooms as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'name') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'surveyRooms') = 'array' then s.data->'surveyRooms' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into survey_domain_rooms (company_id, id, survey_id, name, extra_data)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-survey-room-' || position::text),
       coalesce(item->>'surveyId', item->>'technicalSurveyId', ''),
       coalesce(nullif(coalesce(item->>'name', item->>'room'), ''), 'Ambiente ' || position::text),
       item - 'id' - 'surveyId' - 'technicalSurveyId' - 'name' - 'room'
from source_rooms
on conflict (company_id, id) do nothing;
