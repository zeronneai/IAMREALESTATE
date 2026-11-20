-- I AM Portal · Every pending setup step in one go. Paste all of it in Supabase > SQL Editor and click Run.
-- Safe to run again: it only creates what is missing and never deletes data.

-- ===================== epcad.sql =====================
-- I AM Real Estate · EPCAD index on the server (run once in Supabase > SQL Editor, after schema.sql).
-- Safe to run again. Stores one compact row per EPCAD property (about 425,000 rows, roughly 120 to 200 MB),
-- uploaded from the portal (Import center > 03 > Upload to server). Every teammate can then enrich properties
-- without loading the EPCAD files in their own browser.

create table if not exists epcad_parcels (
  prop_id text primary key,              -- EPCAD property ID
  situs text,                            -- "13617 HAZLEWOOD ST"
  zip text,
  addr_key text,                         -- normalized street line "13617 HAZLEWOOD ST"
  legal text,                            -- "BLK 61 THE PASEOS AT MISSION RIDGE 4 LOT 17"
  sub_key text,                          -- normalized subdivision
  blk text,
  lot text,
  owners text[] default '{}',
  mailing text,
  mailing_zip text,
  absentee boolean default false,
  exemptions text,                       -- HS, OV65, DV4...
  homestead boolean default false,
  over65 boolean default false,
  year_built int,
  living_sqft int,
  land_sqft int,
  acres numeric,
  last_deed_date date,
  last_deed_type text,
  last_deed_instrument text,
  last_grantee text,
  market_value numeric,                  -- empty until EPCAD publishes the year's values
  tax_year int,
  updated_at timestamptz not null default now()
);
create index if not exists epcad_parcels_addr_idx on epcad_parcels(addr_key);
create index if not exists epcad_parcels_blk_lot_idx on epcad_parcels(blk, lot);
create index if not exists epcad_parcels_updated_idx on epcad_parcels(updated_at desc);

alter table epcad_parcels enable row level security;
drop policy if exists epcad_read on epcad_parcels;
create policy epcad_read on epcad_parcels for select using ((select is_team()));
drop policy if exists epcad_insert on epcad_parcels;
create policy epcad_insert on epcad_parcels for insert with check ((select is_team_writer()));
drop policy if exists epcad_update on epcad_parcels;
create policy epcad_update on epcad_parcels for update using ((select is_team_writer())) with check ((select is_team_writer()));

-- Let the API roles see the new table right away.
notify pgrst, 'reload schema';

-- ===================== listings.sql =====================
-- Portal · Publish inventory homes on the public website. Run once in Supabase > SQL Editor, after orgs.sql. Safe to run again.
alter table inventory add column if not exists published boolean not null default false;
alter table inventory add column if not exists published_at timestamptz;
alter table inventory add column if not exists listing jsonb not null default '{}';
  -- { "type": "sale"|"rent"|"multi", "price": 289000, "beds": 3, "baths": 2, "sqft": 1650, "year": 2015,
  --   "area": "Eastside", "desc_en": "...", "desc_es": "...", "photos": ["https://.../1.jpg", ...] }

-- Listing photos: public to read (the website shows them), only the company's team can upload into its own folder.
insert into storage.buckets (id, name, public) values ('listing-photos', 'listing-photos', true)
  on conflict (id) do update set public = true;
drop policy if exists listing_photos_write on storage.objects;
create policy listing_photos_write on storage.objects for insert
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select current_org())::text and (select is_team_writer()));
drop policy if exists listing_photos_change on storage.objects;
create policy listing_photos_change on storage.objects for update
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select current_org())::text and (select is_team_writer()));
drop policy if exists listing_photos_delete on storage.objects;
create policy listing_photos_delete on storage.objects for delete
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select current_org())::text and (select is_team_writer()));
drop policy if exists listing_photos_read on storage.objects;
create policy listing_photos_read on storage.objects for select using (bucket_id = 'listing-photos');

notify pgrst, 'reload schema';

-- ===================== outreach.sql =====================
-- Portal · Conversations (texts and emails with owners). Run once in Supabase > SQL Editor, after orgs.sql. Safe to run again.

-- Each company sends from its own number and email address (set by the platform owner in Settings > Companies).
alter table orgs add column if not exists sms_number text;     -- +19155550123
alter table orgs add column if not exists email_from text;     -- "I AM Real Estate <hello@iamrealestate.co>"
alter table orgs add column if not exists reply_to text;       -- where email replies go

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  parcel_id uuid references parcels(id) on delete set null,
  channel text not null check (channel in ('sms','email')),
  direction text not null check (direction in ('out','in')),
  peer text not null,                 -- +19155551234 or owner@email.com
  subject text,
  body text not null,
  status text default 'sent',         -- sent, delivered, failed, received
  provider_id text,
  error text,
  read boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists messages_org_time_idx on messages(org_id, created_at desc);
create index if not exists messages_peer_idx on messages(org_id, peer, created_at desc);
create index if not exists messages_parcel_idx on messages(parcel_id);

-- People who replied STOP (or asked not to be emailed). Never contacted again on that channel.
create table if not exists opt_outs (
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  channel text not null check (channel in ('sms','email')),
  peer text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, channel, peer)
);

-- Automatic follow ups: a sequence of steps (day, channel, text). Owners are enrolled and get each step on its day.
create table if not exists sequences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  name text not null,
  steps jsonb not null default '[]',      -- [{ "day": 0, "channel": "sms", "subject": "", "body": "Hi {{first}}..." }]
  active boolean not null default true,
  stop_on_reply boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  sequence_id uuid not null references sequences(id) on delete cascade,
  parcel_id uuid not null references parcels(id) on delete cascade,
  phone text,
  email text,
  step int not null default 0,
  next_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','done','stopped','replied','opted_out','failed')),
  last_error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (sequence_id, parcel_id)
);
create index if not exists enrollments_due_idx on enrollments(status, next_at);

do $$
declare t text;
begin
  foreach t in array array['messages','opt_outs','sequences','enrollments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists org_read on %I', t);
    execute format('drop policy if exists org_write on %I', t);
    execute format('create policy org_read on %I for select using (org_id = (select current_org()))', t);
    execute format('create policy org_write on %I for all using (org_id = (select current_org()) and (select is_team_writer())) with check (org_id = (select current_org()) and (select is_team_writer()))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ===================== voice.sql =====================
-- Portal · AI voice agent call log. Run once in Supabase > SQL Editor, after orgs.sql. Safe to run again.
create table if not exists voice_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  parcel_id uuid references parcels(id) on delete set null,
  source text not null default 'test' check (source in ('test','phone')),
  direction text not null default 'in' check (direction in ('in','out')),
  phone text,
  lang text default 'en',
  started_at timestamptz not null default now(),
  duration_sec int,
  transcript jsonb not null default '[]',   -- [{ "role": "agent"|"caller", "text": "..." }]
  summary text,
  data jsonb,                               -- name, address, motivation, timeline, condition, asking_price, best_time, interest, next_step
  interest text,                            -- hot, warm, cold
  reviewed boolean not null default false,
  created_by uuid references auth.users(id)
);
create index if not exists voice_calls_org_idx on voice_calls(org_id, started_at desc);
alter table voice_calls enable row level security;
drop policy if exists org_read on voice_calls;
drop policy if exists org_write on voice_calls;
create policy org_read on voice_calls for select using (org_id = (select current_org()));
create policy org_write on voice_calls for all using (org_id = (select current_org()) and (select is_team_writer())) with check (org_id = (select current_org()) and (select is_team_writer()));
-- Calls can also come from the website "Talk to us" button.
alter table voice_calls drop constraint if exists voice_calls_source_check;
alter table voice_calls add constraint voice_calls_source_check check (source in ('test','phone','web'));
notify pgrst, 'reload schema';

-- ===================== county_search.sql =====================
-- Portal · County search: build lead lists from the whole EPCAD index (like DealMachine, for El Paso).
-- Run once in Supabase > SQL Editor, after epcad.sql. Safe to run again.
create extension if not exists pg_trgm;
create or replace function owners_text(o text[]) returns text language sql immutable as $$ select coalesce(array_to_string(o, ' '), '') $$;
create index if not exists epcad_parcels_zip_idx on epcad_parcels(zip);
create index if not exists epcad_parcels_deed_idx on epcad_parcels(last_deed_date);
create index if not exists epcad_parcels_value_idx on epcad_parcels(market_value);
create index if not exists epcad_parcels_owner_trgm on epcad_parcels using gin (owners_text(owners) gin_trgm_ops);

-- f: { zips: ["79936"], absentee, out_of_area, over65, homestead (true/false), years_owned, value_min, value_max,
--      built_before, built_after, sqft_min, owner (text), owner_type: company|trust|estate|person, homes_only, sort: deed|value|value_asc }
create or replace function county_search(f jsonb default '{}', lim int default 100, off int default 0)
returns table (prop_id text, situs text, zip text, owners text[], mailing text, mailing_zip text, absentee boolean, homestead boolean, over65 boolean,
               exemptions text, year_built int, living_sqft int, land_sqft int, last_deed_date date, last_deed_type text, market_value numeric, legal text, total bigint)
language sql stable security invoker set search_path = public as $$
  with x as (
    select p.*, owners_text(p.owners) as ot from epcad_parcels p
    where p.situs is not null and p.situs <> ''
      and (jsonb_typeof(f->'zips') is distinct from 'array' or jsonb_array_length(f->'zips') = 0 or p.zip in (select jsonb_array_elements_text(f->'zips')))
      and (not coalesce((f->>'absentee')::boolean, false) or p.absentee)
      and (not coalesce((f->>'out_of_area')::boolean, false) or (coalesce(p.mailing_zip, '') <> '' and p.mailing_zip !~ '^(798|799|885)'))
      and (not coalesce((f->>'over65')::boolean, false) or p.over65)
      and (f->>'homestead' is null or p.homestead = (f->>'homestead')::boolean)
      and (f->>'years_owned' is null or p.last_deed_date <= current_date - make_interval(years => (f->>'years_owned')::int))
      and (f->>'value_min' is null or p.market_value >= (f->>'value_min')::numeric)
      and (f->>'value_max' is null or p.market_value <= (f->>'value_max')::numeric)
      and (f->>'built_before' is null or p.year_built <= (f->>'built_before')::int)
      and (f->>'built_after' is null or p.year_built >= (f->>'built_after')::int)
      and (f->>'sqft_min' is null or p.living_sqft >= (f->>'sqft_min')::int)
      and (not coalesce((f->>'homes_only')::boolean, true) or coalesce(p.living_sqft, 0) > 0)
      and (coalesce(f->>'owner', '') = '' or owners_text(p.owners) ilike '%' || (f->>'owner') || '%')
  )
  select x.prop_id, x.situs, x.zip, x.owners, x.mailing, x.mailing_zip, x.absentee, x.homestead, x.over65, x.exemptions, x.year_built, x.living_sqft,
         x.land_sqft, x.last_deed_date, x.last_deed_type, x.market_value, x.legal, count(*) over () as total
  from x
  where case coalesce(f->>'owner_type', '')
          when 'company' then x.ot ~* '\m(LLC|L L C|INC|CORP|CORPORATION|LTD|LP|COMPANY|HOLDINGS|PROPERTIES|INVESTMENTS|GROUP|PARTNERS|VENTURES)\M'
          when 'trust' then x.ot ~* '\m(TRUST|TRUSTEE|TRUSTEES|LIVING TR|REV TR)\M'
          when 'estate' then x.ot ~* '\m(ESTATE|EST OF|HEIRS|DECEASED|DECD)\M'
          when 'person' then x.ot !~* '\m(LLC|INC|CORP|LTD|LP|COMPANY|HOLDINGS|PROPERTIES|INVESTMENTS|TRUST|ESTATE|HEIRS|CITY OF|COUNTY|STATE OF|ISD|CHURCH|AUTHORITY)\M'
          else true end
  order by
    case when f->>'sort' = 'value' then x.market_value end desc nulls last,
    case when f->>'sort' = 'value_asc' then x.market_value end asc nulls last,
    x.last_deed_date asc nulls last, x.prop_id
  limit least(greatest(lim, 1), 500) offset greatest(off, 0)
$$;
grant execute on function county_search(jsonb, int, int) to authenticated;
notify pgrst, 'reload schema';

-- ===================== drive.sql =====================
-- Portal · Driving for Dollars: photos taken from the phone on each property. Run once in Supabase > SQL Editor. Safe to run again.
-- Photos are stored in the 'listing-photos' bucket (created by listings.sql) under <company id>/drive/...
alter table parcels add column if not exists photos text[] not null default '{}';
notify pgrst, 'reload schema';

-- ===================== market.sql =====================
-- Portal · Market map (nationwide listings and owner lookups via RentCast). Run once in Supabase > SQL Editor. Safe to run again.
-- Server-side cache so the same search is not paid for twice. Only the server (service role) reads or writes it.
create table if not exists market_cache (
  key text primary key,
  data jsonb not null,
  total int,
  fetched_at timestamptz not null default now()
);
alter table market_cache enable row level security;   -- no policies: not reachable from the browser
create index if not exists market_cache_time_idx on market_cache(fetched_at);
notify pgrst, 'reload schema';

-- ===================== portfolio.sql =====================
-- Portal · Portfolio and Finance: recurring payments per home (rent in, mortgage, taxes, insurance, HOA, utilities, bills)
-- and a month by month record of what was paid. Adds the "finance" team role. Run once after orgs.sql. Safe to run again.

-- 1. New team role: finance (pays bills, records rent; cannot touch leads)
alter table team_members drop constraint if exists team_members_role_check;
alter table team_members add constraint team_members_role_check check (role in ('admin','agent','viewer','finance'));
create or replace function is_finance_writer() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members m join orgs o on o.id = m.org_id where m.user_id = auth.uid() and o.active and m.role in ('admin','agent','finance'))
$$;

-- 2. What is due every month (or quarter, year, once) for each home
create table if not exists obligations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  inventory_id uuid references inventory(id) on delete cascade,      -- null = company bill not tied to a home
  kind text not null check (kind in ('rent','mortgage','tax','insurance','hoa','utility','repair','other')),
  direction text not null default 'out' check (direction in ('in','out')),
  party text,                                                        -- tenant, lender, vendor
  amount numeric not null default 0,
  frequency text not null default 'monthly' check (frequency in ('monthly','quarterly','yearly','once')),
  due_day int check (due_day between 1 and 31),
  due_date date,                                                     -- first due date (and the only one for "once")
  grace_days int not null default 5,
  autopay boolean not null default false,
  account text,                                                      -- loan or account number, last 4
  pay_url text,                                                      -- where it is paid
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists obligations_org_idx on obligations(org_id);

-- 3. One row per obligation per period once it is paid (or partly paid / waived)
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  obligation_id uuid not null references obligations(id) on delete cascade,
  period date not null,                                              -- first day of the period
  due_date date,
  amount_due numeric,
  amount_paid numeric not null default 0,
  late_fee numeric not null default 0,
  paid_on date,
  method text,                                                       -- ACH, check, Zelle, card, cash, RentRedi, autopay
  reference text,                                                    -- confirmation or check number
  status text not null default 'paid' check (status in ('paid','partial','waived')),
  notes text,
  receipt_url text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (obligation_id, period)
);
create index if not exists payments_org_idx on payments(org_id, period);

do $$
declare t text;
begin
  foreach t in array array['obligations','payments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists org_read on %I', t);
    execute format('drop policy if exists org_write on %I', t);
    execute format('create policy org_read on %I for select using (org_id = (select current_org()))', t);
    execute format('create policy org_write on %I for all using (org_id = (select current_org()) and (select is_finance_writer())) with check (org_id = (select current_org()) and (select is_finance_writer()))', t);
  end loop;
end $$;

-- 4. Finance can also record mortgage statements and mark them paid
drop policy if exists finance_statements on statements;
create policy finance_statements on statements for all
  using (org_id = (select current_org()) and (select is_finance_writer()))
  with check (org_id = (select current_org()) and (select is_finance_writer()));

notify pgrst, 'reload schema';

-- ===================== portfolio_ghl.sql =====================
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

-- ===================== people.sql =====================
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
