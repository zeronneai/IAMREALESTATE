-- I AM Real Estate · 393 Nighthaven St (prop 629886): manual County Clerk check done Nov 24, 2026.
-- Replaces the "needs a manual check" note left by robert_list_20261123.sql.
with org as (select id from orgs where slug = 'iam')
update parcels p set
  notes = replace(p.notes,
    'No recorded documents found under the owner''s name for this subdivision; needs a manual check.',
    '[WATCH] Owner Jennifer V. Padilla bought in The Estates at Emerald Park in Dec 2019 (warranty deed + deed of trust). Since then: new deeds of trust in 2022 (2), 2023 (2) and 2024, and loan extension/modification agreements in 2022, 2024, 2025 (Feb) and 2025 (Sep), so the debt keeps being refinanced. Abstracts of judgment against her in 2010, 2021 and Mar 2025 (a judgment lien may attach to the home). No Notice of Trustee Sale or substitute trustee on record. Note: she also has deeds in Vista del Sol and Tierra del Este, so confirm which loans belong to this home before an offer.'),
  tags = (select array(select distinct unnest(p.tags || array['judgment_lien']::text[]))),
  updated_at = now()
from org where p.org_id = org.id and p.epcad_property_id = '629886';
