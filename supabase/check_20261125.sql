-- I AM Real Estate · Check which SQL files are already applied (Nov 25, 2026). Read only: changes nothing.
-- Each row says one file, what it looks for, what it found, and OK = true if it is applied.
with org as (select id from orgs where slug = 'iam'),
c as (
  select 1 as n, 'obligation_labels / pending_20nov' as file, 'Payment title column' as looks_for,
    (select count(*)::text from information_schema.columns where table_name = 'obligations' and column_name = 'label') as found,
    exists (select 1 from information_schema.columns where table_name = 'obligations' and column_name = 'label') as ok
  union all select 2, 'pending_20nov (homes not owned)', 'Homes marked sold',
    (select count(*)::text from inventory i, org where i.org_id = org.id and i.status = 'sold'),
    (select count(*) from inventory i, org where i.org_id = org.id and i.status = 'sold') >= 20
  union all select 3, 'listing_5206_beautonne', '5206 Beautonne in inventory',
    (select count(*)::text from inventory i, org where i.org_id = org.id and i.address ilike '%5206 Beautonne%'),
    exists (select 1 from inventory i, org where i.org_id = org.id and i.address ilike '%5206 Beautonne%')
  union all select 4, 'robert_list_20261123', 'List "Lista de Robert (nov 2026)" homes',
    (select count(*)::text from list_items li join lists l on l.id = li.list_id, org where l.org_id = org.id and l.name = 'Lista de Robert (nov 2026)'),
    (select count(*) from list_items li join lists l on l.id = li.list_id, org where l.org_id = org.id and l.name = 'Lista de Robert (nov 2026)') >= 14
  union all select 5, 'remates_20261201_20270105', 'Homes in "Remates 1 dic 2026"',
    (select count(*)::text from list_items li join lists l on l.id = li.list_id, org where l.org_id = org.id and l.name = 'Remates 1 dic 2026'),
    (select count(*) from list_items li join lists l on l.id = li.list_id, org where l.org_id = org.id and l.name = 'Remates 1 dic 2026') >= 80
  union all select 6, 'remates_20261201_20270105', 'Homes in "Remates 5 ene 2027"',
    (select count(*)::text from list_items li join lists l on l.id = li.list_id, org where l.org_id = org.id and l.name = 'Remates 5 ene 2027'),
    (select count(*) from list_items li join lists l on l.id = li.list_id, org where l.org_id = org.id and l.name = 'Remates 5 ene 2027') >= 4
  union all select 7, 'nighthaven_20261124', '393 Nighthaven marked HOT',
    (select count(*)::text from parcels p, org where p.org_id = org.id and p.epcad_property_id = '629886' and p.notes like '%[HOT] Owner Jennifer%'),
    exists (select 1 from parcels p, org where p.org_id = org.id and p.epcad_property_id = '629886' and p.notes like '%[HOT] Owner Jennifer%')
  union all select 8, 'voice_outbound (AI calls)', 'Phone column for Jarvis calls',
    (select count(*)::text from information_schema.columns where table_name = 'team_members' and column_name in ('phone', 'jarvis_call', 'call_lang')),
    (select count(*) from information_schema.columns where table_name = 'team_members' and column_name in ('phone', 'jarvis_call', 'call_lang')) = 3
  union all select 9, 'debra_20261125', '526 Debra Ln in inventory',
    (select count(*)::text from inventory i, org where i.org_id = org.id and i.address ilike '526 Debra%'),
    exists (select 1 from inventory i, org where i.org_id = org.id and i.address ilike '526 Debra%')
  union all select 10, 'taxes_remates_20261125', 'Tax rows from the El Paso Tax Office',
    (select count(*)::text from tax_bills t join parcels p on p.id = t.parcel_id, org where p.org_id = org.id and t.entity like 'El Paso Tax Office%'),
    (select count(*) from tax_bills t join parcels p on p.id = t.parcel_id, org where p.org_id = org.id and t.entity like 'El Paso Tax Office%') >= 80
  union all select 11, 'liens_remates_20261125', 'Liens from the County Clerk search',
    (select count(*)::text from liens x join parcels p on p.id = x.parcel_id, org where p.org_id = org.id and x.instrument_number = 'clerk-name-search'),
    (select count(*) from liens x join parcels p on p.id = x.parcel_id, org where p.org_id = org.id and x.instrument_number = 'clerk-name-search') >= 40
)
select n, file, looks_for, found, case when ok then 'OK' else 'MISSING' end as status from c order by n;
