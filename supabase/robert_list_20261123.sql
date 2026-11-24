-- I AM Real Estate · Robert's list (Nov 23, 2026): 14 houses they want to reach (sub-to deals).
-- Adds each one as a property with its county owner, mailing address, county value and what they owe (per Robert),
-- and puts them in the list "Lista de Robert (nov 2026)". Safe to run again: nothing is duplicated.
with org as (select id from orgs where slug = 'iam'),
src(prop_id, address, city, zip, lat, lng, owner, m_addr, m_city, m_zip, absentee, value, owe, notes, tags) as (values
  ('411582','6108 GEIGER AVE','El Paso','79905',31.763621908631,-106.414013309168,'CONTRERAS TOMAS (LE) & MARIA A (LE) & 1','6108 GEIGER AVE','El Paso','79905',false,158393,62000,'From Robert''s list (Nov 2026), area: Lower Valley. Owes about $62,000 per Robert. Life estate on title (possible inheritance or probate).',array['robert_list','probate']::text[]),
  ('57664','7556 TAXCO DR','El Paso','79915',31.749963882893,-106.360407577263,'LOZANO JORGE','7556 TAXCO DR','El Paso','79915',false,201788,95000,'From Robert''s list (Nov 2026), area: Lower Valley. Owes about $95,000 per Robert.',array['robert_list']::text[]),
  ('303777','8531 CHINCHILLA LN','El Paso','79907',31.707649032875,-106.336166580322,'DONAHUE EAMON P','8531 CHINCHILLA LN','El Paso','79907',false,222132,100000,'From Robert''s list (Nov 2026), area: Lower Valley. Owes about $100,000 per Robert.',array['robert_list']::text[]),
  ('348881','11158 EBB TIDE DR','El Paso','79936',31.782403576174,-106.309186676083,'SANCRISTOBAL LINDA M','11158 EBB TIDE DR','El Paso','11158',false,187261,114000,'From Robert''s list (Nov 2026), area: East Side. Owes about $114,000 per Robert.',array['robert_list']::text[]),
  ('411176','2437 ROBERT WYNN DR','El Paso','79936',31.777072692914,-106.297024800935,'MARTINEZ SERGIO','2437 ROBERT WYNN DR','El Paso','79936',false,191892,152000,'From Robert''s list (Nov 2026), area: East Side. Owes about $152,000 per Robert.',array['robert_list']::text[]),
  ('637092','14689 HOLSTEINER CT','El Paso','79938',31.796892770843,-106.209397488644,'RAMIREZ ROGELIO & TARIN HEATHER J','14689 HOLSTEINER CT','El Paso','14689',false,259027,150000,'From Robert''s list (Nov 2026), area: Pebbles area. Owes about $150,000 per Robert.',array['robert_list']::text[]),
  ('627957','14381 NORTH CAVE DR','El Paso','79938',31.776099492083,-106.218560334372,'ARELLANO ROBERTO A','14381 NORTH CAVE DR','El Paso','14381',false,232788,137000,'From Robert''s list (Nov 2026), area: Pebbles area. Owes about $137,000 per Robert.',array['robert_list']::text[]),
  ('317963','7032 LUZ DE ESPEJO DR','El Paso','79912',31.875821904452,-106.553736197485,'RAE ELIZABETH','6257 WESTWIND DR','El Paso','79912',true,305328,207000,'From Robert''s list (Nov 2026), area: West Side. Owes about $207,000 per Robert.',array['robert_list','absentee']::text[]),
  ('115978','9908 LA MORENITA CIR','El Paso','79927',31.666221316334,-106.310325835102,'NUNEZ DANIEL A','ORTIZ MARIA F 9908 LA MORENITA CIR','El Paso','79927',false,183836,63000,'From Robert''s list (Nov 2026), area: Socorro. Owes about $63,000 per Robert.',array['robert_list']::text[]),
  ('336119','10472 KIRKLAND ST','Socorro','79927',31.660027701483,-106.272656366714,'BARRON YVONNE','10472 KIRKLAND ST','Socorro','10472',false,200125,78000,'From Robert''s list (Nov 2026), area: Socorro. Owes about $78,000 per Robert.',array['robert_list']::text[]),
  ('675169','11277 CIELO MAR DR','Socorro','79927',31.665354038972,-106.254136533203,'RAMIREZ MARIA D','11277 CIELO MAR DR','Socorro','11277',false,238708,137000,'From Robert''s list (Nov 2026), area: Socorro. Owes about $137,000 per Robert.',array['robert_list']::text[]),
  ('671887','14229 ANTWERP DR','Horizon City','79928',31.661948691696,-106.19615111859,'CASTRO ASHLEY Y','14229 ANTWERP DR','Horizon City','14229',false,217857,112000,'From Robert''s list (Nov 2026), area: Horizon. Owes about $112,000 per Robert.',array['robert_list']::text[]),
  ('629886','393 NIGHTHAVEN ST','El Paso','79928',31.693254620612,-106.231580695122,'PADILLA JENNIFER V','393 NIGHTHAVEN ST','El Paso','79928',false,274148,181000,'From Robert''s list (Nov 2026), area: Horizon. Owes about $181,000 per Robert.',array['robert_list']::text[]),
  ('118245','721 DESERT ASH DR','Horizon City','79928',31.705221949353,-106.193153218272,'MORALES ALEXIS A',null,null,null,false,195326,120000,'From Robert''s list (Nov 2026), area: Horizon. Owes about $120,000 per Robert.',array['robert_list']::text[])
),
p as (
  insert into parcels (org_id, epcad_property_id, address, city, state, zip, lat, lng, market_value, source, notes, tags)
  select org.id, s.prop_id, s.address, s.city, 'TX', s.zip, s.lat, s.lng, s.value, 'robert_list', s.notes, s.tags from src s, org
  on conflict (org_id, epcad_property_id) do update set
    market_value = excluded.market_value, zip = excluded.zip, lat = coalesce(parcels.lat, excluded.lat), lng = coalesce(parcels.lng, excluded.lng),
    tags = (select array(select distinct unnest(parcels.tags || excluded.tags))),
    notes = case when coalesce(parcels.notes, '') like '%Robert''s list%' then parcels.notes else concat_ws(E'\n', parcels.notes, excluded.notes) end,
    updated_at = now()
  returning id, epcad_property_id
),
o as (
  insert into owners (org_id, parcel_id, name, mailing_address, mailing_city, mailing_state, mailing_zip, is_absentee)
  select (select id from org), p.id, s.owner, s.m_addr, s.m_city, 'TX', s.m_zip, s.absentee
  from src s join p on p.epcad_property_id = s.prop_id
  where not exists (select 1 from owners x where x.parcel_id = p.id)
  returning parcel_id
),
l as (
  insert into liens (org_id, parcel_id, lien_type, holder, amount)
  select (select id from org), p.id, 'mortgage', 'Balance per Robert (to verify)', s.owe
  from src s join p on p.epcad_property_id = s.prop_id
  where not exists (select 1 from liens x where x.parcel_id = p.id and x.holder = 'Balance per Robert (to verify)')
  returning parcel_id
),
lst as (
  insert into lists (org_id, name, description)
  select org.id, 'Lista de Robert (nov 2026)', 'Casas que Robert quiere contactar para subject-to. Dueño y valor del condado; la deuda es la que dio Robert.' from org
  where not exists (select 1 from lists x where x.org_id = org.id and x.name = 'Lista de Robert (nov 2026)')
  returning id
),
lid as (select id from lst union all select x.id from lists x, org where x.org_id = org.id and x.name = 'Lista de Robert (nov 2026)'),
li as (
  insert into list_items (org_id, list_id, parcel_id)
  select (select id from org), (select id from lid limit 1), p.id from p
  on conflict do nothing
  returning parcel_id
)
select (select count(*) from p) as properties, (select count(*) from o) as owners_added, (select count(*) from l) as balances_added, (select count(*) from li) as in_list;

-- Findings from public records (Nov 24, 2026): no back taxes on any of the 14; 2026 bill due Jan 31.
with org as (select id from orgs where slug = 'iam'), f(prop_id, note, tags, tax) as (values
  ('411582', 'Public records (Nov 24, 2026): [HOT] Owner Tomas Contreras has an Affidavit of Death on record (Jan 2023); title is a life estate. Notice of Trustee Sale in 2012 and loan modification in 2013. Taxes: no back taxes; 2026 bill $2,005.51 due Jan 31. Homestead + over 65.', array['probate']::text[], 2005.51),
  ('57664', 'Public records (Nov 24, 2026): Loan from 2011 plus a second deed of trust in 2022. Two UCC financing statements (2015, 2021), usually solar or equipment. Taxes: no back taxes; 2026 bill $3,407.91 due Jan 31. Homestead; taxes paid through mortgage escrow.', array[]::text[], 3407.91),
  ('303777', 'Public records (Nov 24, 2026): [HOT] NOTICE OF TRUSTEE SALE filed Nov 5, 2026: active foreclosure. Loan from 2020, assigned Oct 2026. Taxes: no back taxes; 2026 bill $3,922.04 due Jan 31. Homestead.', array['pre_foreclosure']::text[], 3922.04),
  ('348881', 'Public records (Nov 24, 2026): Loan from 2017 plus a second deed of trust in 2024. Taxes: no back taxes; 2026 bill $5,168.27 due Jan 31. No homestead; taxes paid through mortgage escrow.', array[]::text[], 5168.27),
  ('411176', 'Public records (Nov 24, 2026): [WATCH] Two deeds of trust from 2021 (first and second lien). Loan assigned Oct 2026, which often comes before a foreclosure notice. Taxes: no back taxes; 2026 bill $4,848.59 due Jan 31. No homestead.', array[]::text[], 4848.59),
  ('637092', 'Public records (Nov 24, 2026): Two deeds of trust from 2014, another in 2024 and a subordination in 2026. Owner also bought in Tierra del Este in 2025. Taxes: no back taxes; 2026 bill $5,115.11 due Jan 31. Homestead; taxes paid through mortgage escrow.', array[]::text[], 5115.11),
  ('627957', 'Public records (Nov 24, 2026): [CHECK] Owner holds several properties in Tierra del Este. A MEMORANDUM was recorded Sep 2026 (could be a contract with another buyer); confirm before reaching out. Taxes: no back taxes; 2026 bill $5,881.90 due Jan 31. No homestead.', array[]::text[], 5881.9),
  ('317963', 'Public records (Nov 24, 2026): Owner is an investor with several properties; loan on this house since 2018. Taxes: no back taxes; 2026 bill $8,154.47 due Jan 31. No homestead (likely a rental).', array['absentee']::text[], 8154.47),
  ('115978', 'Public records (Nov 24, 2026): Bought in 2002 with one loan; no new loans recorded. Taxes: no back taxes; 2026 bill $2,107.61 due Jan 31. Homestead + over 65.', array['high_equity']::text[], 2107.61),
  ('336119', 'Public records (Nov 24, 2026): [HOT] APPOINTMENT OF SUBSTITUTE TRUSTEE filed Nov 13, 2026: foreclosure is starting. Several new deeds of trust 2024 to 2026. Old hospital lien (2011). Taxes: no back taxes; 2026 bill $2,716.77 due Jan 31. Homestead + over 65.', array['pre_foreclosure']::text[], 2716.77),
  ('675169', 'Public records (Nov 24, 2026): [WATCH] Two deeds of trust from 2018, loan modifications in 2020 and 2025, another deed of trust in 2025: signs of payment trouble. Taxes: no back taxes; 2026 bill $5,219.55 due Jan 31. Homestead.', array[]::text[], 5219.55),
  ('671887', 'Public records (Nov 24, 2026): Loan from 2018 plus two more deeds of trust in 2024. Owner bought another home in 2024, so this one is likely a rental. Taxes: no back taxes; 2026 bill $7,074.28 due Jan 31. No homestead.', array[]::text[], 7074.28),
  ('629886', 'Public records (Nov 24, 2026): No recorded documents found under the owner''s name for this subdivision; needs a manual check. Taxes: no back taxes; 2026 bill $5,876.97 due Jan 31. Homestead; taxes paid through mortgage escrow.', array[]::text[], 5876.97),
  ('118245', 'Public records (Nov 24, 2026): Two deeds of trust from 2019 and another in 2021; loan assigned Mar 2026. Taxes: no back taxes; 2026 bill $4,356.87 due Jan 31. Homestead.', array[]::text[], 4356.87)
)
update parcels p set
  notes = case when coalesce(p.notes, '') like '%Public records (Nov 24, 2026)%' then p.notes else concat_ws(E'\n', p.notes, f.note) end,
  tags = (select array(select distinct unnest(p.tags || f.tags))),
  updated_at = now()
from f, org where p.org_id = org.id and p.epcad_property_id = f.prop_id;
