// Free owner research: prebuilt searches that open in new tabs. Nothing is scraped; a teammate looks and,
// if they find a phone or email, saves it with "Add contact" (source + date are stored).
const q = encodeURIComponent
const slug = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function researchLinks(p) {
  const o = p.owners?.[0] || {}
  const name = (o.name || '').replace(/\b(ET\s*AL|ESTATE OF|TRUSTEE|ETUX|ETVIR)\b/gi, '').replace(/\s+/g, ' ').trim()
  // county and appraisal records often list "LAST, FIRST"; people search sites want "First Last"
  const firstLast = /,/.test(name) ? name.split(',').map(x => x.trim()).reverse().join(' ') : name
  const city = p.city || 'El Paso', st = p.state || 'TX'
  const full = `${p.address}, ${city}, ${st} ${p.zip || ''}`.trim()
  return [
    { k: 'tps', label: 'TruePeopleSearch', group: 'people', url: `https://www.truepeoplesearch.com/results?name=${q(firstLast)}&citystatezip=${q(`${city}, ${st}`)}` },
    { k: 'tps_addr', label: 'TruePeopleSearch (address)', group: 'people', url: `https://www.truepeoplesearch.com/resultaddress?streetaddress=${q(p.address)}&citystatezip=${q(`${city}, ${st} ${p.zip || ''}`)}` },
    { k: 'fps', label: 'FastPeopleSearch', group: 'people', url: `https://www.fastpeoplesearch.com/name/${slug(firstLast)}_${slug(city)}-${slug(st)}` },
    { k: 'wp', label: 'Whitepages', group: 'people', url: `https://www.whitepages.com/name/${slug(firstLast)}/${slug(city)}-${slug(st)}` },
    { k: 'google', label: 'Google', group: 'people', url: `https://www.google.com/search?q=${q(`"${firstLast}" ${city} ${st}`)}` },
    { k: 'fb', label: 'Facebook', group: 'people', url: `https://www.facebook.com/search/people/?q=${q(`${firstLast} ${city}`)}` },
    { k: 'epcad', label: 'EPCAD', group: 'records', url: `https://epcad.org/Search` },
    { k: 'tax', label: 'El Paso tax office', group: 'records', url: `https://actweb.acttax.com/act_webdev/elpaso/index.jsp` },
    { k: 'clerk', label: 'County Clerk records', group: 'records', url: `https://apps.epcountytx.gov/publicrecords/OfficialPublicRecords` },
    { k: 'fc', label: 'County foreclosure postings', group: 'records', url: `https://apps.epcountytx.gov/publicrecords/Foreclosures` },
    { k: 'maps', label: 'Google Maps', group: 'place', url: `https://www.google.com/maps/search/?api=1&query=${q(full)}` },
    { k: 'sv', label: 'Street View', group: 'place', url: p.lat != null ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${q(full)}` },
    { k: 'zillow', label: 'Zillow', group: 'place', url: `https://www.zillow.com/homes/${q(full.replace(/,/g, ''))}_rb/` },
  ]
}
