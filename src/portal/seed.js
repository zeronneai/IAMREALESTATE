// DEMO DATA ONLY. Every person, phone number, lender and trustee below is fictional.
// Street names and ZIP codes are real El Paso geography; house numbers are invented.
import { firstTuesdays, isoDate, today } from './score.js'

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
const r = rng(20261112)
const pick = a => a[Math.floor(r() * a.length)]
const int = (a, b) => Math.floor(a + r() * (b - a + 1))
const round = (n, k = 1000) => Math.round(n / k) * k

const AREAS = [
  { zip: '79912', lat: 31.842, lng: -106.540, streets: ['N Mesa St', 'Thunderbird Dr', 'Resler Dr', 'Festival Dr'], psf: [150, 210] },
  { zip: '79932', lat: 31.873, lng: -106.590, streets: ['Westwind Dr', 'Belvidere St', 'Helen of Troy Dr', 'Northwestern Dr'], psf: [140, 190] },
  { zip: '79924', lat: 31.905, lng: -106.420, streets: ['Hondo Pass Ave', 'McCombs St', 'Diana Dr', 'Gateway Blvd N'], psf: [95, 135] },
  { zip: '79904', lat: 31.852, lng: -106.443, streets: ['Dyer St', 'Railroad Dr', 'Hercules Ave', 'Sun Valley Dr'], psf: [90, 125] },
  { zip: '79907', lat: 31.722, lng: -106.330, streets: ['Alameda Ave', 'Zaragoza Rd', 'Carolina Dr', 'Ascarate St'], psf: [85, 120] },
  { zip: '79936', lat: 31.775, lng: -106.300, streets: ['Lee Trevino Dr', 'Pebble Hills Blvd', 'Montwood Dr', 'Saul Kleinfeld Dr'], psf: [115, 150] },
  { zip: '79938', lat: 31.830, lng: -106.215, streets: ['Joe Battle Blvd', 'Edgemere Blvd', 'Tierra Este Rd', 'Pellicano Dr'], psf: [120, 155] },
  { zip: '79925', lat: 31.790, lng: -106.370, streets: ['Trowbridge Dr', 'Hawkins Blvd', 'Airway Blvd', 'Montana Ave'], psf: [100, 140] },
  { zip: '79902', lat: 31.787, lng: -106.497, streets: ['Rim Rd', 'Kansas St', 'Arizona Ave', 'Oregon St'], psf: [120, 190] },
  { zip: '79903', lat: 31.792, lng: -106.448, streets: ['Copia St', 'Pershing Dr', 'Piedras St', 'Grant Ave'], psf: [80, 115] },
  { zip: '79915', lat: 31.748, lng: -106.365, streets: ['Yarbrough Dr', 'Hunter Dr', 'Lomaland Dr', 'Marian Ave'], psf: [90, 125] },
  { zip: '79927', lat: 31.662, lng: -106.275, streets: ['Socorro Rd', 'Horizon Blvd', 'Buford Rd', 'Moon Rd'], psf: [95, 130] },
  { zip: '79928', lat: 31.683, lng: -106.180, streets: ['Darrington Rd', 'Eastlake Blvd', 'Ashford St', 'Rojas Dr'], psf: [105, 140] },
]
const FIRST = ['Maria', 'Jose', 'Luis', 'Ana', 'Carlos', 'Rosa', 'Daniel', 'Laura', 'Miguel', 'Patricia', 'Jorge', 'Elena', 'Robert', 'Linda', 'David', 'Sandra', 'Ricardo', 'Monica', 'Victor', 'Teresa', 'Frank', 'Diana', 'Hector', 'Gloria']
const LAST = ['Demo-Alvarado', 'Demo-Benavides', 'Demo-Cordero', 'Demo-Duran', 'Demo-Escobedo', 'Demo-Fuentes', 'Demo-Galindo', 'Demo-Huerta', 'Demo-Ibarra', 'Demo-Jaramillo', 'Demo-Lozano', 'Demo-Montoya', 'Demo-Navarrete', 'Demo-Ochoa', 'Demo-Pacheco', 'Demo-Quintero', 'Demo-Rentería', 'Demo-Saucedo', 'Demo-Tafoya', 'Demo-Urías', 'Demo-Valles', 'Demo-Zubía']
const LENDERS = ['Sample Mortgage Servicing LLC', 'Demo Home Loans NA', 'Example Federal Credit Union', 'Placeholder Bank NA', 'Fictional Lending Corp', 'Mock Capital Mortgage', 'Specimen Servicing Co']
const TRUSTEES = ['Sample Trustee Services LLC', 'Demo Foreclosure Trustees PC', 'Example Substitute Trustee Group', 'Placeholder Legal Trustees']
const FIRMS = ['Demo & Associates PLLC', 'Sample Law Group LLP', 'Example Default Attorneys PC']
const ENTITIES = ['City of El Paso', 'El Paso County', 'El Paso ISD', 'University Medical Center', 'El Paso Community College']
const OUT = [['Albuquerque', 'NM', '87110'], ['Phoenix', 'AZ', '85016'], ['San Antonio', 'TX', '78209'], ['Las Cruces', 'NM', '88011'], ['Dallas', 'TX', '75201'], ['Denver', 'CO', '80205']]

let phoneN = 100
const fakePhone = () => `(915) 555-01${String((phoneN++) % 100).padStart(2, '0')}`

function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d) }
function yearsAgo(y) { const d = today(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() - int(0, 300)); return isoDate(d) }

export function makeParcel(i, kind, saleDates) {
  const a = pick(AREAS)
  const num = int(1, 99) * 100 + int(1, 99)
  const street = pick(a.streets)
  const sqft = int(1050, 2900)
  const value = round(sqft * int(a.psf[0], a.psf[1]))
  const yearBuilt = int(1952, 2018)
  const ownedYrs = int(1, 34)
  const deed = yearsAgo(ownedYrs)
  const first = pick(FIRST), last = pick(LAST)
  const absentee = r() < (kind === 'absentee' ? 1 : 0.28)
  const out = pick(OUT)
  const owners = [{
    name: `${first} ${last}`, absentee,
    mailing: absentee ? `${int(100, 9900)} Sample Ave` : `${num} ${street}`,
    mailingCity: absentee ? out[0] : 'El Paso', mailingState: absentee ? out[1] : 'TX', mailingZip: absentee ? out[2] : a.zip,
    deceased: kind === 'probate',
  }]
  if (r() < 0.35) owners.push({ ...owners[0], name: `${pick(FIRST)} ${last}`, deceased: false })
  const tags = new Set([kind])
  const taxes = ENTITIES.slice(0, int(3, 5)).map(entity => ({ entity, year: 2025, amount: Math.round(value * (entity === 'El Paso ISD' ? 0.0108 : 0.005) * (0.8 + r() * 0.4)), delinquent: false }))
  if (kind === 'tax_delinquent' || r() < 0.3) { taxes.forEach(x => { x.delinquent = true; x.amount = Math.round(x.amount * int(1, 3)) }); tags.add('tax_delinquent') }
  if (absentee) tags.add('absentee')
  const liens = []
  let foreclosure = null
  const origLoan = round(value * (0.65 + r() * 0.3) * (ownedYrs > 15 ? 0.6 : 1))
  const amort = Math.max(0.15, 1 - ownedYrs / 30)
  const estBalance = round(origLoan * amort * (1.02 + r() * 0.06))
  if (kind === 'foreclosure') {
    const sale = pick(saleDates)
    const lender = pick(LENDERS)
    foreclosure = {
      saleDate: sale, saleWindow: '10:00 AM to 1:00 PM', saleLocation: 'El Paso County Courthouse, area designated by the Commissioners Court',
      filingDate: addDays(sale, -int(21, 28)), trustees: [pick(TRUSTEES), `${pick(FIRST)} Demo-Trustee`],
      mortgagee: lender, servicer: r() < 0.5 ? lender : pick(LENDERS), originalLoan: origLoan, dotDate: deed,
      estBalance, instrument: `DEMO-${2026}${String(int(10000, 99999))}`, attorney: pick(FIRMS), outcome: 'scheduled',
    }
    liens.push({ type: 'mortgage', holder: lender, amount: estBalance, recorded: deed })
  } else if (r() < 0.75) {
    liens.push({ type: 'mortgage', holder: pick(LENDERS), amount: estBalance, recorded: deed })
  }
  if (r() < 0.22) liens.push({ type: 'heloc', holder: pick(LENDERS), amount: round(int(15000, 60000)), recorded: addDays(deed, int(400, 3000)) })
  if (r() < 0.15) liens.push({ type: 'judgment', holder: 'Demo Collections LLC', amount: round(int(3000, 25000), 100), recorded: yearsAgo(int(1, 4)) })
  if (r() < 0.10) liens.push({ type: 'mechanic', holder: 'Sample Roofing Co', amount: round(int(4000, 18000), 100), recorded: yearsAgo(1) })
  if (kind === 'vacant') tags.add('vacant')
  const vacant = kind === 'vacant' || r() < 0.08
  const p = {
    id: `demo-${i}`, demo: true, source: 'demo',
    address: `${num} ${street}`, city: 'El Paso', state: 'TX', zip: a.zip,
    lat: a.lat + (r() - 0.5) * 0.026, lng: a.lng + (r() - 0.5) * 0.03,
    epcadId: `DEMO${int(100000, 999999)}`,
    legal: `LOT ${int(1, 40)} BLOCK ${int(1, 90)} DEMO ADDITION UNIT ${int(1, 9)}`,
    type: pick(['Single family', 'Single family', 'Single family', 'Townhome', 'Duplex']),
    yearBuilt, sqft, beds: int(2, 5), baths: pick([1, 1.5, 2, 2, 2.5, 3]), lot: int(5000, 9800),
    marketValue: value, lastDeedDate: deed, lastSalePrice: round(value * (0.45 + ownedYrs * -0.01 + 0.5)),
    vacant, tags: [...tags], status: pick(['new', 'new', 'new', 'contacted', 'contacted', 'appointment', 'offer', 'dead']),
    owners, contacts: [], foreclosure, liens, taxes, notes: '',
    activities: [{ id: `a${i}`, kind: 'import', body: kind === 'foreclosure' ? 'Notice of Trustee Sale imported (demo)' : `Added from ${kind} list (demo)`, at: new Date(Date.now() - int(1, 20) * 86400000).toISOString() }],
    tasks: [],
  }
  if (p.status !== 'new' && r() < 0.6) p.contacts = [{ kind: 'phone', value: fakePhone(), phoneType: pick(['mobile', 'mobile', 'landline']), dnc: r() < 0.15, litigator: false, confidence: int(60, 98), provider: 'demo' }]
  if (r() < 0.25) p.tasks.push({ id: `t${i}`, title: pick(['Call owner back', 'Drive by the property', 'Send offer letter', 'Pull title report']), due: addDays(isoDate(today()), int(-2, 10)), done: false })
  return p
}

export function seed() {
  const sales = firstTuesdays(today(), 3)
  const parcels = []
  let i = 1
  for (let k = 0; k < 36; k++) parcels.push(makeParcel(i++, 'foreclosure', k < 16 ? [sales[0]] : k < 28 ? [sales[1]] : [sales[2]]))
  for (const [kind, n] of [['tax_delinquent', 8], ['absentee', 6], ['probate', 5], ['vacant', 5]]) for (let k = 0; k < n; k++) parcels.push(makeParcel(i++, kind, sales))

  const inv = [
    { address: '4410 Demo Hondo Pass Ave', zip: '79924', status: 'rehab', acquiredOn: '2026-08-14', purchasePrice: 128000, rehabBudget: 42000, rehabActual: 31500, arv: 219000, rent: 0 },
    { address: '9120 Demo Pebble Hills Blvd', zip: '79936', status: 'rented', acquiredOn: '2025-03-02', purchasePrice: 176000, rehabBudget: 18000, rehabActual: 19650, arv: 248000, rent: 1850, tenant: 'Demo Tenant Family A' },
    { address: '305 Demo Kansas St', zip: '79902', status: 'listed', acquiredOn: '2026-05-21', purchasePrice: 161000, rehabBudget: 55000, rehabActual: 58900, arv: 299000, rent: 0, listPrice: 289900 },
    { address: '12245 Demo Tierra Este Rd', zip: '79938', status: 'acquisition', acquiredOn: '2026-11-03', purchasePrice: 189000, rehabBudget: 25000, rehabActual: 0, arv: 262000, rent: 0 },
    { address: '7712 Demo Lomaland Dr', zip: '79915', status: 'rented', acquiredOn: '2024-09-10', purchasePrice: 119000, rehabBudget: 22000, rehabActual: 20400, arv: 186000, rent: 1450, tenant: 'Demo Tenant B' },
    { address: '6031 Demo Westwind Dr', zip: '79932', status: 'sold', acquiredOn: '2025-11-18', purchasePrice: 214000, rehabBudget: 48000, rehabActual: 51200, arv: 335000, soldPrice: 331500, soldOn: '2026-06-30', rent: 0 },
  ].map((x, k) => ({ id: `inv-${k + 1}`, demo: true, holdingMonth: 650 + k * 40, docs: [], notes: '', tenant: x.tenant || '', ...x }))

  const lenders = ['Sample Mortgage Servicing LLC', 'Demo Home Loans NA', 'Example Federal Credit Union', 'Mock Capital Mortgage', 'Placeholder Bank NA']
  inv.forEach((v, k) => {
    if (v.status === 'sold') { v.mortgage = null; v.statements = []; return }
    const orig = round(v.purchasePrice * 0.8)
    const rate = [7.25, 6.875, 7.5, 8.125, 6.5][k % 5]
    const pay = Math.round((orig * (rate / 1200)) / (1 - Math.pow(1 + rate / 1200, -360)))
    const escrow = 380 + k * 35
    v.mortgage = { lender: lenders[k % 5], last4: String(4100 + k * 137).slice(-4), original: orig, rate, payment: pay, escrow, dueDay: 1 }
    v.statements = []
    let bal = orig * 0.995
    for (let m = 5; m >= 0; m--) {
      const d = today(); d.setDate(1); d.setMonth(d.getMonth() - m)
      const due = new Date(d); due.setMonth(due.getMonth() + 1)
      bal -= pay * 0.13
      v.statements.push({ id: `st-${k}-${m}`, statementDate: isoDate(new Date(d.getFullYear(), d.getMonth(), 15)), dueDate: isoDate(due), amountDue: pay + escrow, balance: Math.round(bal), rate, escrow, lateFee: Math.round(pay * 0.05), pastDue: 0, paid: m > 0, fileName: 'demo-statement.pdf' })
    }
  })

  return {
    parcels, inventory: inv,
    lists: [{ id: 'list-1', name: 'Dec sale · high equity (demo)', desc: '', ids: parcels.filter(p => p.foreclosure && p.foreclosure.saleDate === sales[0]).slice(0, 7).map(p => p.id), createdAt: new Date().toISOString() }],
    imports: [{ id: 'imp-1', kind: 'demo', fileName: 'Demo seed', rowsIn: parcels.length, rowsOk: parcels.length, at: new Date().toISOString() }],
    settings: { team: [{ name: 'Demo Admin', email: 'admin@example.com', role: 'admin' }] },
  }
}
