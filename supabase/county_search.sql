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
