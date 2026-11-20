-- Portal · Portfolio as I AM runs it today in HighLevel (Property Management sub-account).
-- Adds wrap payments (homes they owner-finance and collect on), short term loans, 2nd liens, units,
-- the account situation (payment plan, eviction, foreclosure, vacant, disconnected) and a reference
-- to the HighLevel record so importing twice never duplicates. Run once after portfolio.sql. Safe to run again.

alter table obligations drop constraint if exists obligations_kind_check;
alter table obligations add constraint obligations_kind_check
  check (kind in ('rent','mortgage','wrap','loan','tax','insurance','hoa','utility','repair','other'));

alter table obligations add column if not exists lien int not null default 1;
alter table obligations add column if not exists unit text;
alter table obligations add column if not exists situation text not null default 'normal';
alter table obligations drop constraint if exists obligations_situation_check;
alter table obligations add constraint obligations_situation_check
  check (situation in ('normal','payment_plan','eviction','foreclosure','vacant','disconnected'));
alter table obligations add column if not exists ext_ref text;
create unique index if not exists obligations_org_ext_uq on obligations(org_id, ext_ref);

-- Homes they sold with owner financing (they collect the wrap) and homes they simply hold.
alter table inventory drop constraint if exists inventory_status_check;
alter table inventory add constraint inventory_status_check
  check (status in ('acquisition','rehab','listed','rented','financed','owned','sold'));

notify pgrst, 'reload schema';
