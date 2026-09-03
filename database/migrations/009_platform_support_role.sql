-- Usuários de suporte são contas da plataforma, sem vínculo com empresa.
alter table app_users drop constraint if exists app_users_role_check;

alter table app_users
  add constraint app_users_role_check
  check (role in ('admin', 'suporte', 'comercial', 'operacao', 'financeiro', 'leitura', 'operador'));
