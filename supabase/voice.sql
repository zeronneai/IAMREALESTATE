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
