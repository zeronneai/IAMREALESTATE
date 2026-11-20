-- I AM Real Estate · Home for sale sent by Robert on 2026-11-20: 5206 Beautonne Ave (Milagro Hills, 79924).
-- Not on the MLS right now, so there are no listing photos or price to copy. Home details are from the appraisal district
-- (3 bed, 2 bath, 1,683 sqft, built 1958, 7,000 sqft lot).
-- It goes in as "For sale" but NOT public. When the price, terms and photos are in (Inventory > Publish to website), turn it on.
-- Run once in Supabase > SQL Editor. Safe to run again (updates the same home and keeps photos already uploaded).
with org as (select id from orgs where slug = 'iam'),
ex as (select i.id from inventory i, org where i.org_id = org.id and upper(i.address) like '5206 BEAUTONNE%' limit 1),
ins as (
  insert into inventory (org_id, address, zip, status, notes, published, listing)
  select org.id, '5206 Beautonne Ave, El Paso, TX 79924', '79924', 'listed',
    'For sale per Robert (Nov 20, 2026). Milagro Hills. Missing: price, terms and photos.', false, '{}'::jsonb
  from org where not exists (select 1 from ex)
  returning id
),
target as (select id from ex union all select id from ins)
update inventory set status = 'listed',
  listing = coalesce(listing, '{}'::jsonb) || jsonb_build_object(
    'type', 'sale', 'beds', 3, 'baths', 2, 'sqft', 1683, 'year', 1958, 'acres', 0.16, 'area', 'Northeast',
    'desc_en', '3 bed, 2 bath home in Milagro Hills, Northeast El Paso. 1,683 sq ft on a 7,000 sq ft lot.',
    'desc_es', 'Casa de 3 recámaras y 2 baños en Milagro Hills, noreste de El Paso. 1,683 pies cuadrados en un terreno de 7,000 pies cuadrados.')
where id in (select id from target)
returning id, address, status, published;
