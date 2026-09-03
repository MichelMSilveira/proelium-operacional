-- Identidade pessoal e vínculo empresarial são coisas diferentes.
-- Ao sair de uma empresa, a conta Google permanece como perfil/portfólio.
alter table app_users add column if not exists account_type text not null default 'member';
alter table app_users add column if not exists founder boolean not null default false;
alter table app_users add column if not exists profile_info text not null default '';
alter table app_users add column if not exists portfolio jsonb not null default '[]'::jsonb;
alter table app_users add column if not exists modules jsonb not null default '[]'::jsonb;
alter table app_users add column if not exists company_access_override text;

alter table companies add column if not exists founder_username text;

alter table app_users drop constraint if exists app_users_account_type_check;
alter table app_users add constraint app_users_account_type_check
  check (account_type in ('member', 'founder', 'portfolio', 'support'));

-- Empresas existentes: o primeiro administrador passa a ser o fundador registrado.
update companies c
set founder_username = (
  select u.username
  from app_users u
  where u.company_id = c.id and u.role = 'admin'
  order by u.created_at asc, u.username asc
  limit 1
)
where coalesce(c.founder_username, '') = '';

update app_users u
set account_type = 'founder', founder = true
where u.role = 'admin'
  and u.company_id is not null
  and exists (select 1 from companies c where c.id = u.company_id and c.founder_username = u.username);
