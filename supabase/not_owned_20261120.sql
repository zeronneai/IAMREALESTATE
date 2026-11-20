-- I AM Real Estate · Homes Robert says they do NOT own (Slack, 2026-11-20). Takes them out of Portfolio and Finance.
-- Nothing is deleted: homes are marked "sold" (hidden from Portfolio) and their payments stop (inactive), so the
-- history stays and it can be undone. Run in Supabase > SQL Editor. Safe to run again.
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
