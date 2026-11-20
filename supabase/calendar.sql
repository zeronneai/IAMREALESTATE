-- Portal · Calendar: showings, calls, closings and inspections, with an automatic text reminder before each one
-- (replaces HighLevel's calendar and its "Appointment Created + 1 Hr. Reminder" workflow).
-- Run once after orgs.sql and people.sql. Safe to run again.

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default default_org() references orgs(id) on delete cascade,
  title text not null,
  kind text not null default 'showing' check (kind in ('showing','call','meeting','closing','inspection','other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  person_id uuid references people(id) on delete set null,
  inventory_id uuid references inventory(id) on delete set null,
  parcel_id uuid references parcels(id) on delete set null,
  with_name text,                     -- who the appointment is with (copied from the contact or typed)
  with_phone text,                    -- where the reminder goes (+19155551234)
  assigned_name text,                 -- teammate in charge
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','done','cancelled','no_show')),
  remind boolean not null default true,
  remind_minutes int not null default 60,
  reminded_at timestamptz,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists appointments_org_time_idx on appointments(org_id, starts_at);
create index if not exists appointments_remind_idx on appointments(starts_at) where remind and reminded_at is null;

alter table appointments enable row level security;
drop policy if exists org_read on appointments;
create policy org_read on appointments for select using (org_id = (select current_org()));
drop policy if exists org_write on appointments;
create policy org_write on appointments for all
  using (org_id = (select current_org()) and (select is_team_writer()))
  with check (org_id = (select current_org()) and (select is_team_writer()));

-- Reminder text per company (optional). {{first}}, {{when}}, {{where}}, {{company}} are filled in.
alter table orgs add column if not exists reminder_sms text;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------------------------
-- Reminders every 10 minutes (Supabase calls the portal). Vercel's free plan only runs crons once a day,
-- so Supabase does the timing. In Supabase > Database > Extensions turn on pg_cron and pg_net, then run:
--
--   select cron.schedule('iam-reminders', '*/10 * * * *',
--     $$ select net.http_get(url := 'https://iamrealestate.vercel.app/api/cron/reminders') $$);
--
-- If CRON_SECRET is set in Vercel, use this instead (put the same secret in place of YOUR_SECRET):
--
--   select cron.schedule('iam-reminders', '*/10 * * * *',
--     $$ select net.http_get(url := 'https://iamrealestate.vercel.app/api/cron/reminders',
--        headers := jsonb_build_object('Authorization', 'Bearer YOUR_SECRET')) $$);
