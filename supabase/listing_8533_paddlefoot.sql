-- I AM Real Estate · New listing sent by Robert on 2026-11-20: 8533 Paddlefoot Ln (MLS #954687, listed by Angeline Gomez).
-- Run once in Supabase > SQL Editor. Safe to run again (updates the same home). It is published on the website.
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
