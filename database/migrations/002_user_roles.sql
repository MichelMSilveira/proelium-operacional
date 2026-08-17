alter table app_users drop constraint if exists app_users_role_check;

alter table app_users
  add constraint app_users_role_check
  check (role in ('admin', 'comercial', 'operacao', 'financeiro', 'leitura', 'operador'));
