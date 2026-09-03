alter table companies add column if not exists responsible text not null default '';
alter table companies add column if not exists phone text not null default '';
alter table companies add column if not exists status text not null default 'pending';

create unique index if not exists companies_document_idx
  on companies(document)
  where document <> '';
