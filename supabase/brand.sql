-- Portal · Company branding (logo and color). Run once in Supabase > SQL Editor, after orgs.sql. Safe to run again.
alter table orgs add column if not exists logo_url text;
alter table orgs add column if not exists brand_color text;
alter table orgs add column if not exists website text;

-- Company admins can change only their own logo, color and website (not the name or the paused state).
create or replace function set_brand(p_logo text, p_color text, p_website text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_team_admin() then raise exception 'not allowed'; end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'bad color'; end if;
  if p_logo is not null and length(p_logo) > 400000 then raise exception 'logo too large'; end if;
  update orgs set logo_url = p_logo, brand_color = p_color, website = left(p_website, 200) where id = current_org();
end $$;
grant execute on function set_brand(text, text, text) to authenticated;

notify pgrst, 'reload schema';
