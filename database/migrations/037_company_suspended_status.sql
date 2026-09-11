alter table companies drop constraint if exists companies_status_check;
alter table companies add constraint companies_status_check
  check (status in ('pending', 'approved', 'rejected', 'suspended'));
