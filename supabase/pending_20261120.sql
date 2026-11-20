-- Everything pending from Nov 20, 2026, in one go. Safe to run again: nothing is duplicated.
-- 1) Payment titles
-- Custom title for a recurring payment (for example "Rent #14" or "Rent Unit B"),
-- so homes with many units are easy to tell apart. Safe to run more than once.
alter table obligations add column if not exists label text;

-- 2) 8533 Paddlefoot listing
with org as (select id from orgs where slug = 'iam'),
ex as (select i.id from inventory i, org where i.org_id = org.id and upper(i.address) like '8533 PADDLEFOOT%' limit 1),
ins as (
  insert into inventory (org_id, address, zip, status, list_price, notes, published, published_at, listing)
  select org.id, '8533 Paddlefoot Ln, El Paso, TX 79907', '79907', 'listed', 230000,
    'MLS #954687 · Valle De San Miguel · listed by Angeline Gomez (Texas Ally Real Estate Group)', true, now(), '{}'::jsonb
  from org where not exists (select 1 from ex)
  returning id
),
target as (select id from ex union all select id from ins)
update inventory set status = 'listed', list_price = 230000, published = true, published_at = coalesce(published_at, now()),
  listing = jsonb_build_object(
    'type', 'sale', 'price', 230000, 'beds', 4, 'baths', 2, 'sqft', 1884, 'acres', 0.21, 'area', 'Valle De San Miguel',
    'mls', '954687', 'owner_finance', true,
    'desc_en', 'OWNER FINANCE AVAILABLE. 4 bed, 2 bath home in El Paso with strong potential for homeowners or investors. Flexible terms and a solid opportunity you don''t want to pass up.',
    'desc_es', 'FINANCIAMIENTO DEL DUEÑO DISPONIBLE. Casa de 4 recámaras y 2 baños en El Paso, con gran potencial para familias o inversionistas. Términos flexibles y una oportunidad que no te puedes perder.',
    'photos', '["https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160141803768000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160141926429000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142031579000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142137151000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142241456000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142341442000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142433056000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142528926000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142625023000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142715914000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142806205000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142897439000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160142990167000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160143080999000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160143170924000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160143260017000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160143353187000000-o.jpg","https://cdn.resize.sparkplatform.com/gep/1280x1024/true/20261120160143447498000000-o.jpg"]'::jsonb)
where id in (select id from target);

-- 3) Hide the homes Robert said they do not own (last, so its result is what you see)
with pats(p) as (values
  ('%1601 James Chisum%'), ('%James Chisum%'), ('Gustavo%'), ('%Ford Taurus%'), ('%Jim Bridger%'), ('%Alphonia%'), ('%Aphonia%'),
  ('%Greenveil%'), ('%1522 Montana%'), ('%Campo Bello%'), ('%Mike Mendoza%'), ('%Mike A Mendoza%'), ('%Celedon%'), ('%Celedan%'),
  ('%Bishop%'), ('%7363 Dale%'), ('%McCabe%'), ('%Galaxia%'), ('%1915 Olive%'), ('%Olvie%'), ('%E Mountain%'), ('%Hodges%'),
  ('%Friona%'), ('%Laura Marie%'), ('%Lauramane%'), ('%Macaw%'), ('%Caspian%'), ('%Caspla%')
),
org as (select id from orgs where slug = 'iam'),
homes as (
  update inventory i set status = 'sold', published = false
  from org where i.org_id = org.id and exists (select 1 from pats where i.address ilike pats.p)
  returning i.id, i.address
),
obs as (
  update obligations o set active = false
  from org where o.org_id = org.id and (
    o.inventory_id in (select id from homes)
    or exists (select 1 from inventory i, pats where i.id = o.inventory_id and i.address ilike pats.p)
    or exists (select 1 from pats where coalesce(o.party, '') ilike pats.p or coalesce(o.notes, '') ilike pats.p)
  )
  returning o.id
)
select (select count(*) from homes) as homes_hidden, (select count(*) from obs) as payments_stopped,
       (select string_agg(address, ' | ' order by address) from homes) as homes;
