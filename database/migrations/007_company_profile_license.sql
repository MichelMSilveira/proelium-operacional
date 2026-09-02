alter table companies add column if not exists company_type text not null default 'contratante';
alter table companies add column if not exists profile_info text not null default '';
alter table companies add column if not exists license_status text not null default 'pending';
