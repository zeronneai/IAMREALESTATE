-- Portal · Companies (multi-company). Run once in Supabase > SQL Editor, after schema.sql, epcad.sql and team.sql.
-- Safe to run more than once.
-- Every company gets its own properties, lists, inventory, settings and team. Nobody sees another company's data.
-- The EPCAD index (epcad_parcels) stays shared: it is public county data, uploaded once for everyone.
-- Existing data and members move into the first company, "I AM Real Estate".

-- 1. Companies and platform owners
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into orgs (name, slug) values ('I AM Real Estate', 'iam') on conflict (slug) do nothing;

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- 2. Each team member belongs to one company
alter table team_members add column if not exists org_id uuid references orgs(id) on delete cascade;
update team_members set org_id = (select id from orgs where slug = 'iam') where org_id is null;
alter table team_members alter column org_id set not null;
create index if not exists team_members_org_idx on team_members(org_id);

create or replace function current_org() returns uuid language sql stable security definer set search_path = public as $$
  select m.org_id from team_members m join orgs o on o.id = m.org_id where m.user_id = auth.uid() and o.active
$$;
-- Server jobs (no signed in user) write into the first company.
create or replace function default_org() returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(current_org(), (select id from orgs where slug = 'iam'))
$$;
create or replace function is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;
create or replace function is_team() returns boolean language sql stable security definer set search_path = public as $$
  select current_org() is not null
$$;
create or replace function is_team_writer() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members m join orgs o on o.id = m.org_id where m.user_id = auth.uid() and o.active and m.role in ('admin','agent'))
$$;
create or replace function is_team_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members m join orgs o on o.id = m.org_id where m.user_id = auth.uid() and o.active and m.role = 'admin')
$$;

-- 3. Company column on every data table, filled in automatically on insert
do $$
declare t text;
begin
  foreach t in array array['parcels','owners','contacts','foreclosures','notice_inbox','liens','tax_bills','lists','list_items',
                           'inventory','mortgages','statements','activities','tasks','imports','settings']
  loop
    execute format('alter table %I add column if not exists org_id uuid references orgs(id) on delete cascade', t);
    execute format('update %I set org_id = (select id from orgs where slug = ''iam'') where org_id is null', t);
    execute format('alter table %I alter column org_id set default default_org()', t);
    execute format('alter table %I alter column org_id set not null', t);
    execute format('create index if not exists %I on %I(org_id)', t || '_org_idx', t);
    execute format('drop policy if exists team_read on %I', t);
    execute format('drop policy if exists team_write on %I', t);
    execute format('drop policy if exists org_read on %I', t);
    execute format('drop policy if exists org_write on %I', t);
    execute format('create policy org_read on %I for select using (org_id = (select current_org()))', t);
    execute format('create policy org_write on %I for all using (org_id = (select current_org()) and (select is_team_writer())) with check (org_id = (select current_org()) and (select is_team_writer()))', t);
  end loop;
end $$;

-- 4. Uniqueness is per company now (two companies can track the same house)
alter table parcels drop constraint if exists parcels_epcad_property_id_key;
drop index if exists parcels_org_epcad_uq;
create unique index parcels_org_epcad_uq on parcels(org_id, epcad_property_id);
alter table notice_inbox drop constraint if exists notice_inbox_source_key_key;
drop index if exists notice_inbox_org_key_uq;
create unique index notice_inbox_org_key_uq on notice_inbox(org_id, source_key);
alter table settings drop constraint if exists settings_pkey;
alter table settings add primary key (org_id, key);

-- 5. Who can see what
alter table orgs enable row level security;
drop policy if exists orgs_read on orgs;
create policy orgs_read on orgs for select using (id = (select current_org()) or (select is_platform_admin()));
alter table platform_admins enable row level security;
drop policy if exists platform_self on platform_admins;
create policy platform_self on platform_admins for select using (user_id = auth.uid());

drop policy if exists team_self on team_members;
create policy team_self on team_members for select using (org_id = (select current_org()));
drop policy if exists team_admin_write on team_members;
create policy team_admin_write on team_members for all
  using (org_id = (select current_org()) and (select is_team_admin()))
  with check (org_id = (select current_org()) and (select is_team_admin()));

-- Files: each company only touches its own folder (<company id>/...)
drop policy if exists team_files on storage.objects;
create policy team_files on storage.objects for all
  using (bucket_id in ('statements','notices') and (storage.foldername(name))[1] = (select current_org())::text)
  with check (bucket_id in ('statements','notices') and (storage.foldername(name))[1] = (select current_org())::text and (select is_team_writer()));

-- 6. Platform owner (creates companies and can enter any of them for support)
insert into platform_admins (user_id, email)
  select id, email from auth.users where lower(email) = 'fburgos@elsauz.com'
  on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
