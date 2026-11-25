-- I AM Real Estate · 526 Debra Ln, Anthony TX 79821: closed Nov 24, 2026 (Robert, Slack Nov 25). Adds it to Inventory
-- as owned and links it to the property (it was on the Dec 1, 2026 foreclosure list). Safe to run again.
with org as (select id from orgs where slug = 'iam'),
par as (select p.id from parcels p, org where p.org_id = org.id and p.epcad_property_id = '292788'),
ins as (
  insert into inventory (org_id, parcel_id, address, zip, status, acquired_on, arv, notes, published)
  select org.id, (select id from par), '526 Debra Ln, Anthony, TX 79821', '79821', 'owned', '2026-11-24', 168379,
    'Closed Nov 24, 2026 (per Robert). Was on the Dec 1, 2026 foreclosure list. County value $168,379.', false
  from org
  where not exists (select 1 from inventory i, org o2 where i.org_id = o2.id and i.address ilike '526 Debra%')
  returning id
),
upd as (
  update parcels set status = 'under_contract', notes = concat_ws(E'\n', notes, 'Bought by I AM on Nov 24, 2026.'), updated_at = now()
  where id in (select id from par) and coalesce(notes, '') not like '%Bought by I AM%'
  returning id
)
select (select count(*) from ins) as added_to_inventory, (select count(*) from upd) as property_updated;
