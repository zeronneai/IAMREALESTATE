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
