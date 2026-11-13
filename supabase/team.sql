-- I AM Real Estate · Team accounts (email + password). Safe to run more than once.
-- Run in Supabase > SQL Editor after schema.sql.
-- Then in Supabase > Authentication > Sign In / Providers > Email: keep Email enabled and turn OFF "Confirm email".
-- Accounts are created by an admin from the portal (Settings > Team); no emails are sent.

create table if not exists team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'agent' check (role in ('admin','agent','viewer')),
  created_at timestamptz not null default now()
);
alter table team_members add column if not exists full_name text;
alter table team_members add column if not exists created_at timestamptz not null default now();

create or replace function is_team() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where user_id = auth.uid())
$$;
create or replace function is_team_writer() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where user_id = auth.uid() and role in ('admin','agent'))
$$;
create or replace function is_team_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where user_id = auth.uid() and role = 'admin')
$$;

-- Every teammate can see the team list; only admins can change it from the browser.
-- (The portal changes the team through /api/admin/users with the service role, which bypasses RLS.)
alter table team_members enable row level security;
drop policy if exists team_self on team_members;
create policy team_self on team_members for select using ((select is_team()));
drop policy if exists team_admin_write on team_members;
create policy team_admin_write on team_members for all using ((select is_team_admin())) with check ((select is_team_admin()));

-- Keep the stored email in step when an account email changes.
update team_members m set email = u.email from auth.users u where u.id = m.user_id and m.email is distinct from u.email;

-- If the team is still empty, the first person who signs in to the portal becomes admin automatically.
-- To make someone admin by hand (they must already have an account in Authentication > Users):
-- insert into team_members (user_id, email, role) select id, email, 'admin' from auth.users where email = 'SOMEONE@domain.com'
--   on conflict (user_id) do update set role = 'admin';
