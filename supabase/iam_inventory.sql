-- I AM Real Estate · Their current inventory (7 homes sent by Hugo on 2026-11-17).
-- Run once in Supabase > SQL Editor, after orgs.sql and listings.sql. Safe to run again (it skips homes already loaded).
-- Every home is linked to its county record (EPCAD/TxGIO property ID) so the portal shows owner, legal description,
-- county value, map location and photos. All start as Internal (not on the website) until they add photos and publish.

with raw (prop_id, address, city, zip, lat, lng, legal, year_built, county_value, owner, price) as (values
  ('60789', '7211 Alameda Ave', 'El Paso', '79915', 31.748970, -106.386381, 'BALBOA PLACE TR 5 (HOMESITE) (0.0345 AC)', null, 126697, 'BHAKTA SANJEY', 800000),
  ('695182', '12962 Terrington Ave', 'El Paso', '79928', 31.683407, -106.236420, 'BLK 19 PEYTON ESTATES 5 LOT 28', null, 248977, 'RIVERA GIOVANNI R', 850000),
  ('146493', '529 Link Dr', 'El Paso', '79907', 31.713214, -106.323604, 'HENRY REPLAT TR 4', null, 131318, 'DOMINGUEZ ARNOLDO & GUILLERMINA', 175000),
  ('106539', '11479 Socorro Rd', 'Socorro', '79927', 31.615912, -106.283853, '9 FREIDMAN ESTATES 1 LOT 48 (6877 SQ FT) HIST DIST 78 MELODY 14X75 SN 478470S32143', null, 36148, '1 FRED MARTI CF LLC', 175000),
  ('107487', '9848 Bomarc St', 'El Paso', '79924', 31.894181, -106.401649, '11 DALE BELLAMAH LOT 13 (6800 SQ FT)', null, 141630, '9848 BOMARC ST TRUST', 175000),
  ('208672', '840 Barandal Dr', 'El Paso', '79907', 31.724979, -106.327181, '1 EL DORADO S 30 FT OF 13 (3300 SQ FT)', null, 152851, 'GARZA JOSE L JR', null),
  ('22751', '3515 Dyer St', 'El Paso', '79930', 31.807938, -106.444775, '102 GRANDVIEW 17 & 18 (6000 SQ FT)', null, 138729, '1522 MONTANA LLC', 358000)
),
src as (select prop_id, address, city, zip, lat::float8 lat, lng::float8 lng, legal, year_built::int year_built, county_value::numeric county_value, owner, price::numeric price from raw),
org as (select id from orgs where slug = 'iam'),
p as (
  insert into parcels (org_id, epcad_property_id, address, city, state, zip, lat, lng, legal_description, year_built, market_value, source, notes, tags)
  select org.id, s.prop_id, s.address, s.city, 'TX', s.zip, s.lat, s.lng, s.legal, s.year_built, s.county_value, 'manual',
         'Inventory of I AM Real Estate. County owner on record: ' || coalesce(s.owner, 'n/a'), '{inventory}'
  from src s, org
  on conflict (org_id, epcad_property_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now()
  returning id, epcad_property_id
)
insert into inventory (org_id, parcel_id, address, zip, status, list_price, notes, published, listing)
select org.id, p.id, s.address || ', ' || s.city || ', TX ' || s.zip, s.zip, 'listed', s.price,
       'Sent by Hugo (I AM) on 2026-11-17.' || case when s.price is null then ' No price yet (shows Call for price).' else '' end,
       false,
       jsonb_strip_nulls(jsonb_build_object('type', 'sale', 'price', s.price, 'year', s.year_built, 'photos', '[]'::jsonb))
from src s join p on p.epcad_property_id = s.prop_id, org
where not exists (select 1 from inventory i where i.org_id = org.id and i.parcel_id = p.id);

-- Fill the rest from the EPCAD index (sq ft, last deed) if it is already uploaded to the server.
do $$ begin
  if to_regclass('public.epcad_parcels') is not null then
    update parcels p set
      sqft = coalesce(p.sqft, e.living_sqft), lot_sqft = coalesce(p.lot_sqft, e.land_sqft),
      year_built = coalesce(p.year_built, e.year_built), last_deed_date = coalesce(p.last_deed_date, e.last_deed_date),
      market_value = coalesce(e.market_value, p.market_value), updated_at = now()
    from epcad_parcels e
    where e.prop_id = p.epcad_property_id and 'inventory' = any(p.tags) and p.org_id = (select id from orgs where slug = 'iam');
  end if;
end $$;
