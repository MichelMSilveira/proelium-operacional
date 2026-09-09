create table if not exists knowledge_domain_state (
  company_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_domain_articles (
  company_id text not null,
  id text not null,
  author_username text,
  tag text not null default 'Referencia tecnica',
  title text not null,
  summary text not null default '',
  basis text not null default '',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create index if not exists knowledge_domain_articles_company_idx
  on knowledge_domain_articles (company_id, updated_at desc);

insert into knowledge_domain_state (company_id, revision)
select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end,
       revision
from app_state
on conflict (company_id) do update
set revision = greatest(knowledge_domain_state.revision, excluded.revision), updated_at = now();

with source_states as (
  select case when state_key = 'shared' then 'legacy' else regexp_replace(state_key, '^company:', '') end as company_id,
         data
  from app_state
), source_articles as (
  select s.company_id, item,
         row_number() over (partition by s.company_id order by item->>'id', item->>'title') as position
  from source_states s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'articles') = 'array' then s.data->'articles' else '[]'::jsonb end
  ) item
  where jsonb_typeof(item) = 'object'
)
insert into knowledge_domain_articles (
  company_id, id, author_username, tag, title, summary, basis, extra_data
)
select company_id,
       coalesce(nullif(item->>'id', ''), 'legacy-article-' || position::text),
       nullif(coalesce(item->>'authorUsername', item->>'author'), ''),
       coalesce(nullif(coalesce(item->>'tag', item->>'category'), ''), 'Referencia tecnica'),
       coalesce(nullif(coalesce(item->>'title', item->>'name'), ''), 'Artigo sem titulo'),
       coalesce(coalesce(item->>'summary', item->>'description'), ''),
       coalesce(item->>'basis', ''),
       item - 'id' - 'authorUsername' - 'author' - 'tag' - 'category' - 'title' - 'name' - 'summary' - 'description' - 'basis'
from source_articles
on conflict (company_id, id) do nothing;
