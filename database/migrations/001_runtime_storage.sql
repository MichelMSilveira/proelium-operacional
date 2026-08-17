create table if not exists app_state (
  state_key text primary key,
  data jsonb not null,
  revision bigint not null check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists app_state_revisions (
  state_key text not null,
  revision bigint not null check (revision >= 0),
  data jsonb not null,
  updated_at timestamptz not null,
  actor text not null default 'migration',
  stored_at timestamptz not null default now(),
  primary key (state_key, revision)
);

create index if not exists app_state_revisions_stored_idx
  on app_state_revisions (state_key, stored_at desc);

create table if not exists app_users (
  username text primary key check (username ~ '^[a-z0-9][a-z0-9._-]{1,31}$'),
  name text not null,
  role text not null check (role in ('admin', 'operador')),
  active boolean not null default true,
  salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
