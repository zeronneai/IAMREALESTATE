import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, date, modal, toast, icon, api, fileToDataURL, dropzone, parseCSV, num, toIso, $ } from '../ui.js'

// Pending AI extractions waiting for human approval
let pending = []
const ZIP_LL = { '79912': [31.842, -106.54], '79932': [31.873, -106.59], '79924': [31.905, -106.42], '79904': [31.852, -106.443], '79907': [31.711, -106.33], '79936': [31.775, -106.3], '79938': [31.83, -106.215], '79925': [31.79, -106.37], '79902': [31.778, -106.502], '79903': [31.787, -106.448], '79915': [31.748, -106.365], '79927': [31.652, -106.275], '79928': [31.683, -106.18], '79905': [31.767, -106.43], '79901': [31.758, -106.487], '79922': [31.81, -106.56], '79930': [31.81, -106.46], '79934': [31.95, -106.43], '79935': [31.77, -106.33], '79911': [31.89, -106.55], '79835': [31.93, -106.59], '79821': [31.98, -106.6], '79849': [31.56, -106.25], '79836': [31.58, -106.21] }
const jitter = z => { const b = ZIP_LL[z]; return b ? { lat: b[0] + (Math.random() - 0.5) * 0.03, lng: b[1] + (Math.random() - 0.5) * 0.03 } : {} }

export function importer(el) {
  el.innerHTML = `
  <div class="import-grid">
    <div class="card fade-in"><h3>01 · ${esc(t('i.notices'))}</h3>
      <p class="muted" style="margin-top:0">${esc(t('i.notices_hint'))}</p>
      <div class="drop" id="ndrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>PDF · JPG · PNG</p></div>
      <div class="review" id="nreview" style="margin-top:12px"></div>
    </div>
    <div class="card fade-in"><h3>02 · ${esc(t('i.fetch'))}</h3>
      <p class="muted" style="margin-top:0">${esc(t('i.fetch_hint'))}</p>
      <div class="toolbar"><input type="month" id="fmonth" value="${new Date().toISOString().slice(0, 7)}" style="height:34px;border-radius:8px;border:1px solid var(--line);background:var(--ink-2);padding:0 10px" /><button class="btn gold" id="fetch">${esc(t('i.fetch'))}</button></div>
      <div id="fout" style="margin-top:10px"></div>
      <h3 style="margin-top:22px">03 · ${esc(t('i.epcad'))}</h3>
      <p class="muted" style="margin-top:0">${esc(t('i.epcad_hint'))}</p>
      <div class="drop" id="edrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>CSV · TXT</p></div>
    </div>
    <div class="card fade-in"><h3>04 · ${esc(t('i.csv'))}</h3>
      <p class="muted" style="margin-top:0">${esc(t('i.csv_hint'))}</p>
      <div class="drop" id="cdrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>CSV</p></div>
    </div>
    <div class="card fade-in"><h3>${esc(t('i.history'))}</h3>
      <table class="mini"><tr><th>Date</th><th>Type</th><th>File</th><th class="num">Rows</th></tr>${S.imports().slice(0, 12).map(i => `<tr><td class="mono" style="font-size:11.5px">${esc(new Date(i.at).toLocaleDateString())}</td><td>${esc(i.kind)}</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${esc(i.fileName || '')}</td><td class="num">${i.rowsOk}/${i.rowsIn}</td></tr>`).join('')}</table>
    </div>
  </div>`
  renderPending()
  dropzone($('#ndrop', el), files => notices(files), { accept: 'application/pdf,image/*' })
  dropzone($('#edrop', el), files => csvFlow(files[0], 'epcad'), { multiple: false, accept: '.csv,.txt,text/csv,text/plain' })
  dropzone($('#cdrop', el), files => csvFlow(files[0], 'list'), { multiple: false, accept: '.csv,text/csv' })
  $('#fetch', el).onclick = async () => {
    const out = $('#fout', el); out.innerHTML = '<div class="boot-bar" style="width:100%"></div>'
    const r = await api('/api/sources/epcounty', { month: $('#fmonth', el).value }).catch(() => ({ status: 0 }))
    if (r.ok) {
      pending.push(...(r.data.notices || []).map(n => ({ file: 'county feed', data: n })))
      out.innerHTML = `<div class="alert ok">${r.data.count} notices</div>`; renderPending()
    } else out.innerHTML = `<div class="alert">${esc(t('i.not_configured'))}${r.data?.needs ? ` <span class="mono">${esc(r.data.needs.join(', '))}</span>` : ''}</div>`
  }
}

async function notices(files) {
  const box = $('#nreview')
  for (const f of files) {
    const id = 'n' + Math.random().toString(36).slice(2, 7)
    box.insertAdjacentHTML('afterbegin', `<div class="alert" id="${id}">${esc(f.name)} · ${esc(t('m.reading'))}…</div>`)
    let data = {}, msg = ''
    try {
      if (f.size > 3_300_000) throw new Error('too_large')
      const r = await api('/api/extract-notice', { file: await fileToDataURL(f) })
      if (r.ok) data = r.data.data || {}
      else msg = r.status === 501 ? t('m.ai_off') : (r.data.detail || r.data.error || t('toast.err'))
    } catch (e) { msg = e.message === 'too_large' ? 'File over 3.3 MB' : t('m.ai_off') }
    document.getElementById(id)?.remove()
    pending.push({ file: f.name, data, msg })
    renderPending()
  }
}

function renderPending() {
  const box = $('#nreview'); if (!box) return
  box.innerHTML = pending.map((x, i) => {
    const d = x.data
    const fld = (k, label, type = 'text', v = d[k]) => `<div class="f"><label>${esc(label)}</label><input data-k="${k}" type="${type}" value="${esc(Array.isArray(v) ? v.join('; ') : v ?? '')}" /></div>`
    return `<div class="review-item" data-i="${i}">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(x.file)}</b>${x.msg ? `<span class="pill warn">${esc(x.msg)}</span>` : '<span class="pill ok">AI</span>'}</div>
      <div class="form-grid">
        ${fld('property_address', 'Address')}${fld('zip', 'ZIP')}${fld('sale_date', t('f.sale'), 'date')}
        ${fld('grantors', t('c.owner'))}${fld('mortgagee', t('d.mortgagee'))}${fld('trustees', t('d.trustees'))}
        ${fld('original_loan_amount', t('d.orig'), 'number')}${fld('deed_of_trust_date', t('d.dot'), 'date')}${fld('legal_description', t('d.legal'))}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sm ghost" data-discard>${esc(t('i.discard'))}</button><button class="btn sm gold" data-approve>${esc(t('i.approve'))}</button></div>
    </div>`
  }).join('')
  box.querySelectorAll('.review-item').forEach(it => {
    const i = +it.dataset.i
    it.querySelector('[data-discard]').onclick = () => { pending.splice(i, 1); renderPending() }
    it.querySelector('[data-approve]').onclick = async () => {
      const v = Object.fromEntries([...it.querySelectorAll('[data-k]')].map(inp => [inp.dataset.k, inp.value.trim()]))
      if (!v.property_address || !v.sale_date) return toast('Address + sale date')
      const owners = v.grantors.split(/;|&| and /i).map(s => s.trim()).filter(Boolean).map(name => ({ name, absentee: false }))
      const orig = num(v.original_loan_amount)
      const res = await S.importParcels([{
        address: v.property_address.replace(/,?\s*El Paso.*$/i, ''), zip: v.zip, ...jitter(v.zip), legal: v.legal_description, owners,
        foreclosure: { saleDate: v.sale_date, saleWindow: pending[i].data.sale_time_window || '', saleLocation: pending[i].data.sale_location || '', trustees: v.trustees.split(';').map(s => s.trim()).filter(Boolean), mortgagee: v.mortgagee, originalLoan: orig, dotDate: v.deed_of_trust_date || null, estBalance: orig ? Math.round(orig * 0.85) : null, filingDate: pending[i].data.filing_date || null, attorney: pending[i].data.attorney_or_firm || '', instrument: pending[i].data.deed_of_trust_instrument || '' },
      }], { tag: 'foreclosure', source: 'notice' })
      S.logImport({ kind: 'notice_pdf', fileName: pending[i].file, rowsIn: 1, rowsOk: res.added + res.updated })
      pending.splice(i, 1); renderPending(); toast(`${t('i.done')}: ${res.added} · ${t('i.updated')}: ${res.updated}`)
    }
  })
}

// ---------- CSV / EPCAD mapping ----------
const LIST_FIELDS = [['address', 'Property address'], ['zip', 'ZIP'], ['ownerName', 'Owner full name'], ['firstName', 'Owner first name'], ['lastName', 'Owner last name'], ['owner2', 'Owner 2'], ['mailing', 'Mailing address'], ['mailingCity', 'Mailing city'], ['mailingState', 'Mailing state'], ['mailingZip', 'Mailing ZIP'], ['phone1', 'Phone 1'], ['phone2', 'Phone 2'], ['phone3', 'Phone 3'], ['email', 'Email'], ['marketValue', 'Value'], ['yearBuilt', 'Year built'], ['sqft', 'Sqft'], ['beds', 'Beds'], ['baths', 'Baths'], ['lastDeedDate', 'Last sale / deed date'], ['saleDate', 'Auction / sale date'], ['lender', 'Lender'], ['loanBalance', 'Loan balance'], ['taxDue', 'Tax due'], ['lat', 'Latitude'], ['lng', 'Longitude']]
const EPCAD_FIELDS = [['epcadId', 'Property ID'], ['address', 'Situs address'], ['ownerName', 'Owner name'], ['mailing', 'Mailing address'], ['mailingCity', 'Mailing city'], ['mailingState', 'Mailing state'], ['mailingZip', 'Mailing ZIP'], ['marketValue', 'Market / appraised value'], ['yearBuilt', 'Year built'], ['sqft', 'Living area'], ['lot', 'Land sqft'], ['lastDeedDate', 'Deed date'], ['legal', 'Legal description']]
const GUESS = { firstName: /^(owner ?1? ?)?first/i, lastName: /^(owner ?1? ?)?last/i, address: /situs|prop.*addr|^address$|street|property address/i, zip: /^(prop.*)?zip|postal/i, ownerName: /owner.*full|^owner$|^owner name$|^name$|full name/i, owner2: /owner ?2/i, mailing: /mail.*addr/i, mailingCity: /mail.*city/i, mailingState: /mail.*state/i, mailingZip: /mail.*zip/i, phone1: /phone ?1|^phone$|mobile|cell/i, phone2: /phone ?2/i, phone3: /phone ?3/i, email: /e-?mail/i, marketValue: /market|apprais|est.*value|^value$|avm/i, yearBuilt: /year.*built|yr.*blt|built/i, sqft: /living|sq.*ft|sqft|bldg.*area/i, beds: /bed/i, baths: /bath/i, lastDeedDate: /deed.*date|last.*sale.*date|sale date|recording/i, saleDate: /auction|trustee.*sale|foreclos.*date/i, lender: /lender|mortgagee|beneficiary/i, loanBalance: /balance|loan amount|open.*loan/i, taxDue: /tax.*(due|delinq)/i, epcadId: /prop.*id|account|geo.*id|^id$/i, lot: /land|lot/i, legal: /legal/i, lat: /^lat/i, lng: /^(lng|lon)/i }

async function csvFlow(file, kind) {
  const text = await file.text()
  const { head, rows } = parseCSV(text)
  if (!head.length || !rows.length) return toast(t('toast.err'))
  const fields = kind === 'epcad' ? EPCAD_FIELDS : LIST_FIELDS
  const guess = k => head.find(h => GUESS[k]?.test(h)) || ''
  modal(`<h3>${esc(t('i.map_cols'))}</h3><p class="muted" style="margin:0">${esc(file.name)} · ${rows.length} ${esc(t('rows'))}</p>
    ${kind === 'list' ? `<div class="f"><label>${esc(t('i.tag_as'))}</label><select id="ctag">${['absentee', 'tax_delinquent', 'high_equity', 'vacant', 'probate', 'foreclosure'].map(x => `<option value="${x}">${esc(t('tag.' + x))}</option>`).join('')}</select></div>` : `<div class="alert">${esc(t('i.match_by'))}: Property ID → address</div>`}
    <div class="mapper">${fields.map(([k, label]) => `<div class="f"><label>${esc(label)}</label><select data-k="${k}"><option value="">n/a</option>${head.map(h => `<option ${guess(k) === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>`).join('')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-close>${esc(t('d.close'))}</button><button class="btn gold" data-go>${esc(t('i.import'))} ${rows.length}</button></div>`, (box, close) => {
    box.querySelector('[data-go]').onclick = async () => {
      const map = Object.fromEntries([...box.querySelectorAll('[data-k]')].map(s => [s.dataset.k, s.value]).filter(([, v]) => v))
      const get = (r, k) => map[k] ? r[map[k]] : ''
      if (kind === 'epcad') {
        const out = rows.map(r => ({ epcadId: get(r, 'epcadId'), address: get(r, 'address'), ownerName: get(r, 'ownerName'), mailing: get(r, 'mailing'), mailingCity: get(r, 'mailingCity'), mailingState: get(r, 'mailingState'), mailingZip: get(r, 'mailingZip'), marketValue: num(get(r, 'marketValue')), yearBuilt: num(get(r, 'yearBuilt')), sqft: num(get(r, 'sqft')), lot: num(get(r, 'lot')), lastDeedDate: toIso(get(r, 'lastDeedDate')), legal: get(r, 'legal') }))
        const res = S.enrichFromEpcad(out)
        S.logImport({ kind: 'epcad', fileName: file.name, rowsIn: rows.length, rowsOk: res.updated })
        toast(`${t('i.updated')}: ${res.updated}`); return close()
      }
      const tag = box.querySelector('#ctag').value
      const out = rows.filter(r => get(r, 'address')).map(r => {
        const zip = (get(r, 'zip') || '').slice(0, 5)
        const owners = [get(r, 'ownerName') || [get(r, 'firstName'), get(r, 'lastName')].filter(Boolean).join(' '), get(r, 'owner2')].filter(Boolean).map(name => ({ name, mailing: get(r, 'mailing'), mailingCity: get(r, 'mailingCity'), mailingState: get(r, 'mailingState'), mailingZip: (get(r, 'mailingZip') || '').slice(0, 5), absentee: !!(get(r, 'mailingZip') && get(r, 'mailingZip').slice(0, 5) !== zip) }))
        const contacts = ['phone1', 'phone2', 'phone3'].map(k => get(r, k)).filter(Boolean).map(v => ({ kind: 'phone', value: v, provider: 'csv' })).concat(get(r, 'email') ? [{ kind: 'email', value: get(r, 'email'), provider: 'csv' }] : [])
        const bal = num(get(r, 'loanBalance')), tax = num(get(r, 'taxDue'))
        const ll = num(get(r, 'lat')) != null ? { lat: num(get(r, 'lat')), lng: num(get(r, 'lng')) } : jitter(zip)
        return {
          address: get(r, 'address'), zip, ...ll, owners, contacts, marketValue: num(get(r, 'marketValue')) || 0, yearBuilt: num(get(r, 'yearBuilt')), sqft: num(get(r, 'sqft')), beds: num(get(r, 'beds')), baths: num(get(r, 'baths')), lastDeedDate: toIso(get(r, 'lastDeedDate')),
          liens: bal ? [{ type: 'mortgage', holder: get(r, 'lender') || '', amount: bal }] : [],
          taxes: tax ? [{ entity: 'Imported', amount: tax, delinquent: true }] : [],
          foreclosure: get(r, 'saleDate') ? { saleDate: toIso(get(r, 'saleDate')), mortgagee: get(r, 'lender'), estBalance: bal, trustees: [] } : null,
        }
      })
      const res = await S.importParcels(out, { tag, source: 'csv:' + file.name })
      S.logImport({ kind: 'csv', fileName: file.name, rowsIn: rows.length, rowsOk: res.added + res.updated })
      S.done(); toast(`${t('i.done')}: ${res.added} · ${t('i.updated')}: ${res.updated}`); close()
    }
  })
}
