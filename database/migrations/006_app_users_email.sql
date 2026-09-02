-- Backfill the Google identity field for installations where migration 004
-- was recorded before the app_users table had been created.
alter table app_users add column if not exists email text;
create unique index if not exists app_users_email_idx on app_users(lower(email)) where email is not null and email <> '';
