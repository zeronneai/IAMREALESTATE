-- Portal · Contacts: the people I AM works with that are not property owners (buyers, sellers, renters, investors, agents).
-- Replaces the HighLevel contact list and its Buyers / Sellers / Renters pipelines. Texts and emails with them show in
-- Conversations, matched by phone or email. Run once after orgs.sql. Safe to run again.

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  first_name text,
  last_name text,
  name text,
  phone text,                        -- +19155551234
  email text,
  business text,
  kind text not null default 'other' check (kind in ('buyer','seller','renter','investor','agent','other')),
  stage text,                        -- New Buyer Lead, Fact Finding, Actively Looking, Under Contract, Closed...
  value numeric,                     -- budget or deal value
  tags text[] not null default '{}',
  source text,
  notes text,
  dnd boolean not null default false,
  ext_ref text,                      -- HighLevel contact id, so importing twice updates instead of duplicating
  last_activity timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists people_org_ext_uq on people(org_id, ext_ref);
create index if not exists people_org_phone_idx on people(org_id, phone);
create index if not exists people_org_email_idx on people(org_id, lower(email));
create index if not exists people_org_kind_idx on people(org_id, kind, stage);

alter table people enable row level security;
drop policy if exists org_read on people;
create policy org_read on people for select using (org_id = (select current_org()));
drop policy if exists org_write on people;
create policy org_write on people for all
  using (org_id = (select current_org()) and (select is_team_writer()))
  with check (org_id = (select current_org()) and (select is_team_writer()));

notify pgrst, 'reload schema';
