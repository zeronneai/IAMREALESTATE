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
