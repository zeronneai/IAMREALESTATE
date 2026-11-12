// npm run test:parsers : checks the keyless readers against the fictional fixtures.
import { readFileSync } from 'node:fs'
import { parseNotice, splitNotices } from '../src/portal/parse/notice.js'
import { parseStatement } from '../src/portal/parse/statement.js'
import { parseTaxLines } from '../src/portal/parse/table.js'
import { normStreet } from '../src/portal/parse/address.js'
import { createIndex, addRow, headerMap, detectDelimiter, finalize, lookupMaps, matchParcel, toParcelPatch } from '../src/portal/parse/epcad.js'

const root = new URL('../src/portal/fixtures/', import.meta.url)
const notices = JSON.parse(readFileSync(new URL('notices.json', root)))
const statements = JSON.parse(readFileSync(new URL('statements.json', root)))
let pass = 0, fail = 0
const eq = (name, got, want) => {
  const ok = typeof want === 'number' ? Math.abs((got ?? NaN) - want) < 0.01 : String(got ?? '').toUpperCase() === String(want).toUpperCase()
  if (ok) pass++; else { fail++; console.log(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }
}

notices.forEach((n, i) => {
  const { fields: f, score } = parseNotice(n.text)
  const e = n.expect
  console.log(`notice ${i + 1}: score ${score}`)
  for (const k of ['sale_date', 'property_address', 'zip', 'mortgagee', 'servicer', 'deed_of_trust_date', 'instrument_number', 'original_loan_amount', 'filing_date']) if (e[k] != null) eq(`n${i + 1}.${k}`, f[k], e[k])
  if (e.grantors_len != null) eq(`n${i + 1}.grantors`, f.grantors.length, e.grantors_len)
  if (e.trustees_len != null) eq(`n${i + 1}.trustees`, f.trustees.length, e.trustees_len)
  if (e.legal_has) eq(`n${i + 1}.legal`, (f.legal_description || '').toUpperCase().includes(e.legal_has.toUpperCase()), true)
  if (e.window) eq(`n${i + 1}.window`, f.sale_time_window, e.window)
})

const packet = notices.map(n => n.text).join('\n\f\n')
eq('packet.split', splitNotices(packet).length, notices.length)

statements.forEach((s, i) => {
  const { fields: f, score } = parseStatement(s.text)
  console.log(`statement ${i + 1}: score ${score}`)
  for (const [k, v] of Object.entries(s.expect)) eq(`s${i + 1}.${k}`, f[k], v)
})

const tax = parseTaxLines(['ACCOUNT   OWNER   PROPERTY ADDRESS   TAX YEARS   AMOUNT DUE', 'D123-456-7890   DEMO-ZUBIA HECTOR   4281 EDGEMERE BLVD   2023-2025   $8,851.20', 'D555-000-1111   FICTICIO ANA   1819 LOMALAND DR   2025   $1,204.00'])
eq('tax.rows', tax.length, 2); eq('tax.amount', tax[0]?.amount, 8851.2); eq('tax.addr', tax[1]?.address, '1819 LOMALAND DR')
eq('addr.norm', normStreet('4281 North Edgemere Boulevard, Apt 2, El Paso, TX'), '4281 N EDGEMERE BLVD')

// EPCAD sample files (fictional)
const ix = createIndex()
for (const n of ['Properties', 'Owners', 'Values', 'Deeds']) {
  const lines = readFileSync(new URL(`../public/portal-samples/sample-epcad-${n}.txt`, import.meta.url), 'utf8').trim().split('\n')
  const d = detectDelimiter(lines[0]); const hm = headerMap(lines[0].split(d)); lines.slice(1).forEach(l => addRow(ix, hm, l.split(d)))
}
const maps = lookupMaps(finalize(ix))
const hit = matchParcel(maps, { address: '4934 Belvidere Street', zip: '79932' })
eq('epcad.match', hit?.id, '900004'); eq('epcad.value', hit?.value, 338900); eq('epcad.deed', hit?.deed, '2019-04-22')
const patch = toParcelPatch(hit, '79932'); eq('epcad.absentee', patch.owner.absentee, true)
eq('epcad.hs', matchParcel(maps, { address: '3791 HUNTER DR', zip: '79915' })?.ov65, true)
eq('epcad.unit', matchParcel(maps, { address: '5501 MCCOMBS ST APT 2', zip: '79924' })?.id, '900005')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
