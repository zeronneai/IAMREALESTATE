-- I AM Real Estate · Team portal schema (Supabase / Postgres)
-- Run in Supabase > SQL Editor. Then create the storage buckets at the bottom.
-- Access model: every authenticated user listed in team_members can read and write team data.

create extension if not exists "pgcrypto";

-- Team ---------------------------------------------------------------------
create table if not exists team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'agent' check (role in ('admin','agent','viewer')),
  created_at timestamptz not null default now()
);

create or replace function is_team() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where user_id = auth.uid())
$$;
create or replace function is_team_writer() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where user_id = auth.uid() and role in ('admin','agent'))
$$;

-- Parcels (one row per property, the hub for every list) ------------------
create table if not exists parcels (
  id uuid primary key default gen_random_uuid(),
  epcad_property_id text unique,
  address text not null,
  city text default 'El Paso',
  state text default 'TX',
  zip text,
  lat double precision,
  lng double precision,
  legal_description text,
  property_type text,
  year_built int,
  sqft int,
  beds numeric,
  baths numeric,
  lot_sqft int,
  market_value numeric,
  assessed_value numeric,
  last_deed_date date,
  last_sale_price numeric,
  vacant boolean default false,
  tags text[] default '{}',            -- foreclosure, tax_delinquent, absentee, high_equity, vacant, probate
  status text not null default 'new' check (status in ('new','contacted','appointment','offer','under_contract','dead')),
  score int,
  score_breakdown jsonb,
  notes text,
  source text,                          -- epcad, notice, csv:reiskip, csv:landglide, manual
  demo boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists parcels_zip_idx on parcels(zip);
create index if not exists parcels_tags_idx on parcels using gin(tags);

create table if not exists owners (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references parcels(id) on delete cascade,
  name text not null,
  mailing_address text,
  mailing_city text,
  mailing_state text,
  mailing_zip text,
  is_absentee boolean default false,
  deceased boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists owners_parcel_idx on owners(parcel_id);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references owners(id) on delete cascade,
  parcel_id uuid not null references parcels(id) on delete cascade,
  kind text not null check (kind in ('phone','email')),
  value text not null,
  phone_type text,                      -- mobile, landline, voip
  dnc boolean default false,
  litigator boolean default false,
  confidence int,
  provider text,                        -- batchdata, reiskip, manual
  traced_at timestamptz default now()
);
create index if not exists contacts_parcel_idx on contacts(parcel_id);

create table if not exists foreclosures (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references parcels(id) on delete cascade,
  sale_date date not null,
  sale_time_window text,
  sale_location text,
  filing_date date,
  trustees text[] default '{}',
  mortgagee text,
  servicer text,
  original_loan_amount numeric,
  deed_of_trust_date date,
  est_loan_balance numeric,
  instrument_number text,
  attorney_firm text,
  outcome text check (outcome in ('scheduled','postponed','sold','cancelled','reinstated')) default 'scheduled',
  source_url text,
  created_at timestamptz not null default now()
);
create index if not exists foreclosures_sale_idx on foreclosures(sale_date);

-- Raw inbox the daily cron writes to before a human approves into parcels/foreclosures
create table if not exists notice_inbox (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  sale_date date,
  property_address text,
  zip text,
  grantors text[],
  mortgagee text,
  trustees text[],
  original_loan_amount numeric,
  deed_of_trust_date date,
  legal_description text,
  source_url text,
  raw jsonb,
  approved boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists liens (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references parcels(id) on delete cascade,
  lien_type text not null,              -- mortgage, heloc, tax, mechanic, judgment, hoa, irs
  holder text,
  amount numeric,
  recorded_date date,
  instrument_number text
);

create table if not exists tax_bills (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references parcels(id) on delete cascade,
  entity text not null,                 -- City of El Paso, El Paso County, ISD, UMC, EPCC
  tax_year int,
  amount_due numeric,
  delinquent boolean default false
);

-- Lists (batch leads) ------------------------------------------------------
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists list_items (
  list_id uuid not null references lists(id) on delete cascade,
  parcel_id uuid not null references parcels(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, parcel_id)
);

-- Inventory and mortgages --------------------------------------------------
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references parcels(id) on delete set null,
  address text not null,
  zip text,
  status text not null default 'acquisition' check (status in ('acquisition','rehab','listed','rented','sold')),
  acquired_on date,
  purchase_price numeric,
  rehab_budget numeric,
  rehab_actual numeric,
  arv numeric,
  list_price numeric,
  sold_price numeric,
  sold_on date,
  tenant_name text,
  monthly_rent numeric,
  holding_cost_month numeric,
  docs jsonb default '[]',
  notes text,
  demo boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists mortgages (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventory(id) on delete cascade,
  lender text,
  loan_last4 text,
  original_amount numeric,
  interest_rate numeric,
  monthly_payment numeric,
  escrow numeric,
  due_day int,
  maturity_date date
);

create table if not exists statements (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventory(id) on delete cascade,
  mortgage_id uuid references mortgages(id) on delete set null,
  statement_date date,
  payment_due_date date,
  amount_due numeric,
  principal_balance numeric,
  interest_rate numeric,
  escrow numeric,
  late_fee numeric,
  past_due_amount numeric,
  paid boolean default false,
  file_path text,                       -- storage path in bucket "statements"
  extracted jsonb,
  created_at timestamptz not null default now()
);

-- Work log -----------------------------------------------------------------
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references parcels(id) on delete cascade,
  kind text not null,                   -- note, call, text, email, status, skiptrace, import
  body text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references parcels(id) on delete cascade,
  title text not null,
  due_on date,
  done boolean default false,
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                   -- notice_pdf, epcad, csv
  file_name text,
  rows_in int,
  rows_ok int,
  meta jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row level security -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['parcels','owners','contacts','foreclosures','notice_inbox','liens','tax_bills','lists','list_items',
                           'inventory','mortgages','statements','activities','tasks','imports','settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists team_read on %I', t);
    execute format('drop policy if exists team_write on %I', t);
    execute format('create policy team_read on %I for select using (is_team())', t);
    execute format('create policy team_write on %I for all using (is_team_writer()) with check (is_team_writer())', t);
  end loop;
end $$;

alter table team_members enable row level security;
drop policy if exists team_self on team_members;
create policy team_self on team_members for select using (is_team());

-- Storage buckets (private) --------------------------------------------------
insert into storage.buckets (id, name, public) values ('statements','statements', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('notices','notices', false) on conflict do nothing;
drop policy if exists team_files on storage.objects;
create policy team_files on storage.objects for all
  using (bucket_id in ('statements','notices') and is_team())
  with check (bucket_id in ('statements','notices') and is_team_writer());

-- After the first teammate signs in once, make them admin:
-- insert into team_members (user_id, email, role) select id, email, 'admin' from auth.users where email = 'TU_CORREO@dominio.com';
