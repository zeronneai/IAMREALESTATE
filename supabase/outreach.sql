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
