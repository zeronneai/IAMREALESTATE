import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, date, modal, toast, icon, api, fileToDataURL, dropzone, parseCSV, num, toIso, $, money } from '../ui.js'
import { readDocument } from '../pdfread.js'
import { parseNotices, parseNotice } from '../parse/notice.js'
import { parseTaxLines } from '../parse/table.js'
import { normStreet } from '../parse/address.js'
import * as EP from '../epcad.js'

// Notices waiting for review: { file, fields, confidence, score, text, ocr }
let pending = []
const ZIP_LL = { '79912': [31.842, -106.54], '79932': [31.873, -106.59], '79924': [31.905, -106.42], '79904': [31.852, -106.443], '79907': [31.711, -106.33], '79936': [31.775, -106.3], '79938': [31.83, -106.215], '79925': [31.79, -106.37], '79902': [31.778, -106.502], '79903': [31.787, -106.448], '79915': [31.748, -106.365], '79927': [31.652, -106.275], '79928': [31.683, -106.18], '79905': [31.767, -106.43], '79901': [31.758, -106.487], '79922': [31.81, -106.56], '79930': [31.81, -106.46], '79934': [31.95, -106.43], '79935': [31.77, -106.33], '79911': [31.89, -106.55], '79835': [31.93, -106.59], '79821': [31.98, -106.6], '79849': [31.56, -106.25], '79836': [31.58, -106.21] }
export const jitter = z => { const b = ZIP_LL[z]; return b ? { lat: b[0] + (Math.random() - 0.5) * 0.03, lng: b[1] + (Math.random() - 0.5) * 0.03 } : {} }
const findByStreet = street => { const k = normStreet(street); return S.parcels().find(p => normStreet(p.address) === k) }

export function importer(el) {
  el.innerHTML = `
  <div class="import-grid">
    <div class="card fade-in" style="grid-column:1/-1"><h3>01 · ${esc(t('i.notices'))}<span class="r pill ok">${esc(t('s.keyless'))}</span></h3>
      <p class="muted" style="margin-top:0">${esc(t('i.notices_hint'))}</p>
      <div class="drop" id="ndrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>PDF · JPG · PNG</p></div>
      <div class="toolbar" style="margin-top:10px"><span class="muted" style="font-size:12.5px">${esc(t('i.try'))}:</span>
        <button class="btn sm" data-sample="sample-notices-packet.pdf">${esc(t('i.sample_text'))}</button>
        <button class="btn sm" data-sample="sample-notice-scanned.pdf">${esc(t('i.sample_scan'))}</button></div>
      <div id="nprog"></div>
      <div class="review" id="nreview" style="margin-top:12px"></div>
    </div>
    <div style="display:grid;gap:18px;align-content:start">
      <div class="card fade-in"><h3>02 · ${esc(t('i.fetch'))}</h3>
        <p class="muted" style="margin-top:0">${esc(t('i.fetch_hint'))}</p>
        <div class="toolbar"><input type="month" id="fmonth" value="${new Date().toISOString().slice(0, 7)}" class="inp" /><button class="btn gold" id="fetch">${esc(t('i.fetch'))}</button>
        <a class="btn ghost" href="https://apps.epcountytx.gov/publicrecords/Foreclosures" target="_blank" rel="noopener">${esc(t('i.open_county'))}</a></div>
        <div id="fout" style="margin-top:10px"></div>
      </div>
      <div class="card fade-in"><h3>03 · ${esc(t('i.epcad'))}<span class="r pill" id="epstat">…</span></h3>
        <p class="muted" style="margin-top:0">${esc(t('i.epcad_hint'))}</p>
        <div class="drop" id="edrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>TXT (~) · CSV</p></div>
        <div class="toolbar" style="margin-top:10px"><a class="btn sm ghost" href="https://epcad.org/OpenGovernment" target="_blank" rel="noopener">epcad.org/OpenGovernment</a><button class="btn sm" data-esample>${esc(t('i.try'))}</button><button class="btn sm gold" id="epapply" disabled>${esc(t('i.epcad_apply'))}</button></div>
        <div id="esrv"></div>
        <div id="eout"></div>
      </div>
    </div>
    <div class="card fade-in"><h3>04 · ${esc(t('i.tax'))}<span class="r pill ok">${esc(t('s.keyless'))}</span></h3>
      <p class="muted" style="margin-top:0">${esc(t('i.tax_hint'))}</p>
      <div class="drop" id="tdrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>PDF · CSV</p></div>
      <div class="toolbar" style="margin-top:10px"><span class="muted" style="font-size:12.5px">${esc(t('i.try'))}:</span><button class="btn sm" data-tsample="sample-tax-list.pdf">sample-tax-list.pdf</button></div>
      <div id="tout"></div>
    </div>
    <div class="card fade-in"><h3>05 · ${esc(t('i.csv'))}</h3>
      <p class="muted" style="margin-top:0">${esc(t('i.csv_hint'))}</p>
      <div class="drop" id="cdrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>CSV</p></div>
      <h3 style="margin-top:22px">${esc(t('i.history'))}</h3>
      <table class="mini"><tr><th>Date</th><th>Type</th><th>File</th><th class="num">Rows</th></tr>${S.imports().slice(0, 10).map(i => `<tr><td class="mono" style="font-size:11.5px">${esc(new Date(i.at).toLocaleDateString())}</td><td>${esc(i.kind)}</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${esc(i.fileName || '')}</td><td class="num">${i.rowsOk}/${i.rowsIn}</td></tr>`).join('')}</table>
    </div>
  </div>`
  renderPending()
  dropzone($('#ndrop', el), files => notices(files), { accept: 'application/pdf,image/*' })
  dropzone($('#edrop', el), files => epcadFiles(files), { accept: '.csv,.txt,text/csv,text/plain' })
  dropzone($('#tdrop', el), files => taxFile(files[0]), { multiple: false, accept: 'application/pdf,.csv,text/csv' })
  dropzone($('#cdrop', el), files => csvFlow(files[0], 'list'), { multiple: false, accept: '.csv,text/csv' })
  el.querySelectorAll('[data-sample]').forEach(b => b.onclick = async () => notices([await sampleFile(b.dataset.sample)]))
  el.querySelector('[data-tsample]').onclick = async () => taxFile(await sampleFile('sample-tax-list.pdf'))
  epStatus()
  el.querySelector('[data-esample]').onclick = async () => epcadFiles(await Promise.all(['Properties', 'Owners', 'Values', 'Deeds'].map(async n => { const r = await fetch(`/portal-samples/sample-epcad-${n}.txt`); return new File([await r.blob()], `sample-epcad-${n}.txt`, { type: 'text/plain' }) })))
  $('#epapply', el).onclick = () => applyEpcadAll()
  $('#fetch', el).onclick = async () => {
    const out = $('#fout', el); out.innerHTML = '<div class="boot-bar" style="width:100%"></div>'
    const r = await api('/api/sources/epcounty', { month: $('#fmonth', el).value }).catch(() => ({ status: 0 }))
    if (r.ok) {
      pending.push(...(r.data.notices || []).map(n => ({ file: n.source_url || 'county source', fields: n.fields, confidence: n.confidence, score: n.score, text: n.text || '' })))
      out.innerHTML = `<div class="alert ok">${r.data.count} ${esc(t('i.found'))}${r.data.skipped ? ` · ${r.data.skipped} dup` : ''}</div>`; renderPending()
    } else out.innerHTML = `<div class="alert">${esc(t('i.not_configured'))}${r.data?.needs ? `<br/><span class="mono" style="font-size:11.5px">${esc(r.data.needs.join(', '))}</span>` : ''}${r.data?.detail ? `<br/><span class="mono" style="font-size:11.5px">${esc(r.data.detail)}</span>` : ''}</div>`
  }
}
async function sampleFile(name) {
  const r = await fetch('/portal-samples/' + name)
  return new File([await r.blob()], name, { type: 'application/pdf' })
}

// ---------- 01 notices: keyless reader ----------
async function notices(files) {
  const prog = $('#nprog')
  for (const f of files) {
    const id = 'n' + Math.random().toString(36).slice(2, 7)
    prog.insertAdjacentHTML('beforeend', `<div class="alert" id="${id}"><span class="spin"></span> ${esc(t('i.reading'))} ${esc(f.name)}…</div>`)
    try {
      const doc = await readDocument(f, pg => {
        const n = document.getElementById(id); if (!n) return
        n.innerHTML = `<span class="spin"></span> ${esc(f.name)} · ${pg.stage === 'ocr' ? esc(t('i.ocr')) + (pg.pct != null ? ` ${pg.pct}%` : '') : esc(t('i.page')) + ` ${pg.page}/${pg.pages}`}`
      })
      const found = parseNotices(doc.text)
      found.forEach((n, k) => pending.push({ file: found.length > 1 ? `${f.name} · #${k + 1}` : f.name, fields: n.fields, confidence: n.confidence, score: n.score, text: n.text, ocr: doc.ocrPages > 0, raw: f }))
      document.getElementById(id)?.remove()
      toast(`${f.name}: ${found.length} ${t('i.found')}${doc.ocrPages ? ' · OCR' : ''}`)
    } catch (e) {
      console.warn(e)
      const n = document.getElementById(id); if (n) n.outerHTML = `<div class="alert bad">${esc(f.name)}: ${esc(e.message || t('toast.err'))}</div>`
    }
    renderPending()
  }
}

const FIELDS = [
  ['property_address', 'Address', 'text'], ['zip', 'ZIP', 'text'], ['sale_date', 'f.sale', 'date'],
  ['grantors', 'c.owner', 'text'], ['mortgagee', 'd.mortgagee', 'text'], ['servicer', 'd.servicer', 'text'],
  ['trustees', 'd.trustees', 'text'], ['original_loan_amount', 'd.orig', 'number'], ['deed_of_trust_date', 'd.dot', 'date'],
  ['instrument_number', 'Instrument', 'text'], ['filing_date', 'd.filed', 'date'], ['sale_time_window', 'Time', 'text'],
  ['attorney_or_firm', 'd.attorney', 'text'], ['legal_description', 'd.legal', 'text'],
]
function renderPending() {
  const box = $('#nreview'); if (!box) return
  const hi = pending.filter(x => x.score >= 85).length
  box.innerHTML = (pending.length > 1 ? `<div class="toolbar"><span class="muted">${pending.length} ${esc(t('i.found'))}</span><span class="sp"></span>${hi ? `<button class="btn sm gold" data-allhi>${esc(t('i.approve_all'))} (${hi})</button>` : ''}</div>` : '') + pending.map((x, i) => {
    const d = x.fields || {}, c = x.confidence || {}
    const fld = ([k, label, type]) => { const v = d[k]; const cf = c[k] || (v ? 'high' : 'low'); return `<div class="f ${k === 'legal_description' ? 'full' : ''} conf-${cf}"><label>${esc(label.includes('.') ? t(label) : label)}${cf !== 'high' ? ` <span class="cf">${cf === 'med' ? '?' : '!'}</span>` : ''}</label><input data-k="${k}" type="${type}" value="${esc(Array.isArray(v) ? v.join('; ') : v ?? '')}" step="any" /></div>` }
    const sc = x.score ?? 0
    return `<div class="review-item" data-i="${i}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><b style="word-break:break-all">${esc(x.file)}</b>
        <span style="display:flex;gap:6px;align-items:center">${x.ocr ? `<span class="pill blue">OCR</span>` : ''}<span class="pill ${sc >= 85 ? 'ok' : sc >= 60 ? 'warn' : 'bad'}">${esc(t('i.conf'))} ${sc}%</span></span></div>
      ${sc < 85 ? `<div class="muted" style="font-size:12px">${esc(t('i.check'))}</div>` : ''}
      <div class="rv-split"><div class="form-grid">${FIELDS.map(fld).join('')}</div>
        <details class="raw"><summary>${esc(t('i.raw'))}</summary><pre>${esc((x.text || '').slice(0, 6000))}</pre></details></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn sm ghost" data-ai>${esc(t('i.ai_assist'))}</button><button class="btn sm ghost" data-discard>${esc(t('i.discard'))}</button><button class="btn sm gold" data-approve>${esc(t('i.approve'))}</button></div>
    </div>`
  }).join('')
  box.querySelector('[data-allhi]')?.addEventListener('click', async () => { for (const x of pending.filter(y => y.score >= 85)) await approve(x, x.fields); pending = pending.filter(y => y.score < 85); renderPending() })
  box.querySelectorAll('.review-item').forEach(it => {
    const i = +it.dataset.i, x = pending[i]
    it.querySelector('[data-discard]').onclick = () => { pending.splice(i, 1); renderPending() }
    it.querySelector('[data-ai]').onclick = async () => {
      if (!x.raw || x.raw.size > 3_300_000) return toast(t('i.ai_none'))
      const r = await api('/api/extract-notice', { file: await fileToDataURL(x.raw) }).catch(() => ({ status: 0 }))
      if (!r.ok) return toast(t('i.ai_none'))
      const a0 = r.data.data || {}
      const a = { ...a0, instrument_number: a0.instrument_number || a0.deed_of_trust_instrument, servicer: a0.servicer || a0.mortgage_servicer }
      for (const k of Object.keys(x.fields)) if ((x.fields[k] == null || x.fields[k] === '' || (Array.isArray(x.fields[k]) && !x.fields[k].length)) && a[k] != null) { x.fields[k] = a[k]; x.confidence[k] = 'med' }
      renderPending()
    }
    it.querySelector('[data-approve]').onclick = async () => {
      const v = Object.fromEntries([...it.querySelectorAll('[data-k]')].map(inp => [inp.dataset.k, inp.value.trim()]))
      if (!v.property_address || !v.sale_date) return toast('Address + sale date')
      await approve(x, v); pending.splice(i, 1); renderPending()
    }
  })
}
async function approve(x, v) {
  const list = val => (Array.isArray(val) ? val : String(val || '').split(';')).map(s => String(s).trim()).filter(Boolean)
  const owners = list(v.grantors).map(name => ({ name, absentee: false }))
  const orig = num(v.original_loan_amount)
  const address = String(v.property_address).replace(/,?\s*El Paso.*$/i, '').trim()
  const res = await S.importParcels([{
    address, zip: v.zip, ...jitter(v.zip), legal: v.legal_description, owners,
    foreclosure: { saleDate: v.sale_date, saleWindow: v.sale_time_window || '', saleLocation: x.fields?.sale_location || '', trustees: list(v.trustees), mortgagee: v.mortgagee, servicer: v.servicer || '', originalLoan: orig, dotDate: v.deed_of_trust_date || null, estBalance: orig ? Math.round(orig * 0.85) : null, filingDate: v.filing_date || null, attorney: v.attorney_or_firm || '', instrument: v.instrument_number || '' },
  }], { tag: 'foreclosure', source: 'notice' })
  const p = findByStreet(address)
  if (p) { const patch = await EP.patchForAsync(p).catch(() => null); if (patch) S.applyEnrichment(p.id, patch) }
  S.logImport({ kind: 'notice_pdf', fileName: x.file, rowsIn: 1, rowsOk: res.added + res.updated })
  toast(`${t('i.done')}: ${res.added} · ${t('i.updated')}: ${res.updated}`)
}

// ---------- 03 EPCAD index ----------
const fmtN = n => Number(n || 0).toLocaleString()
async function epStatus() {
  const st = $('#epstat'), ap = $('#epapply'), srv = $('#esrv'); if (!st) return
  const m = await EP.ready().catch(() => null)
  let server = null
  if (S.MODE === 'supabase') server = await EP.serverStatus().catch(() => null)
  const onServer = server?.count > 0
  st.className = 'r pill ' + (onServer || m ? 'ok' : '')
  st.textContent = onServer ? `${t('i.epcad_server')} · ${fmtN(server.count)}` : m ? `${t('i.epcad_ready')} · ${fmtN(m.count)}` : t('i.epcad_none')
  if (ap) ap.disabled = !(m || onServer)
  if (srv && S.MODE === 'supabase') {
    const pend = EP.pendingUpload(), up = EP.uploadState()
    srv.innerHTML = server?.error === 'no_table'
      ? `<div class="alert bad" style="margin-top:10px">${esc(t('i.epcad_no_table'))}</div>`
      : `<div class="muted" style="font-size:12.5px;margin-top:10px">${esc(t('i.epcad_server'))}: <b>${fmtN(server?.count)}</b> ${esc(t('i.parcels'))}${server?.at ? ` · ${esc(t('i.updated'))} ${esc(new Date(server.at).toLocaleString())}` : ''}</div>
         ${pend?.length ? `<div class="toolbar" style="margin-top:8px"><button class="btn sm gold" id="epup">${esc(up && up.done && up.done < up.total ? t('i.epcad_resume') : t('i.epcad_upload'))} (${fmtN(pend.length)})</button><button class="btn sm ghost" id="epstop" style="display:none">${esc(t('i.epcad_stop'))}</button></div><div class="up-bar" id="epbar" style="display:none"><span></span></div><div class="muted mono" id="epupt" style="font-size:11.5px"></div>` : ''}`
    $('#epup')?.addEventListener('click', uploadEpcad)
    $('#epstop')?.addEventListener('click', () => EP.stopUpload())
  }
}
async function uploadEpcad() {
  const bar = $('#epbar'), txt = $('#epupt'), btn = $('#epup'), stop = $('#epstop')
  bar.style.display = 'block'; btn.disabled = true; stop.style.display = ''
  const t0 = Date.now()
  try {
    const r = await EP.uploadToServer(({ done, total }) => {
      bar.firstElementChild.style.width = `${Math.round((done / total) * 100)}%`
      const sec = (Date.now() - t0) / 1000
      txt.textContent = `${fmtN(done)} / ${fmtN(total)} · ${Math.round((done / total) * 100)}%`
      void sec
    })
    toast(r.stopped ? t('i.epcad_paused') : `${t('i.epcad_uploaded')} · ${fmtN(r.done)}`)
  } catch (e) {
    console.warn(e)
    txt.textContent = e.code === 'no_table' ? t('i.epcad_no_table') : `${t('i.epcad_upload_err')} (${fmtN(e.done)}): ${e.message}`
  }
  btn.disabled = false; stop.style.display = 'none'
  epStatus()
}
async function epcadFiles(files) {
  const out = $('#eout')
  out.innerHTML = `<div class="alert"><span class="spin"></span> ${esc(t('i.epcad_building'))}…</div>`
  try {
    const r = await EP.buildFromFiles(files, pg => {
      if (pg.step === 'finish') { out.innerHTML = `<div class="alert"><span class="spin"></span> ${esc(t('i.epcad_finishing'))}…</div>`; return }
      out.innerHTML = `<div class="alert"><span class="spin"></span> ${esc(t('i.epcad_building'))} · ${esc(pg.file)}${pg.pct != null ? ` · ${pg.pct}%` : ` · ${fmtN(pg.rows)}`}</div>`
    })
    const kinds = r.files.map(f => f.kind).filter(Boolean)
    const missing = r.kind === 'dump' ? ['owners', 'improvements', 'deeds', 'lands'].filter(k => !kinds.includes(k)) : []
    out.innerHTML = `<div class="alert ok">${fmtN(r.count)} ${esc(t('i.parcels'))} · ${r.files.map(f => `${esc(f.name)} (${fmtN(f.rows)})`).join(', ')}</div>
      ${missing.length ? `<div class="alert">${esc(t('i.epcad_missing'))}: ${missing.join(', ')}</div>` : ''}
      ${r.kind === 'dump' && !r.valuesFilled ? `<div class="alert">${esc(t('i.epcad_no_values'))}</div>` : ''}
      ${r.skipped?.length ? `<div class="alert">${esc(t('i.epcad_skipped'))}: ${r.skipped.map(esc).join(', ')}</div>` : ''}`
    S.logImport({ kind: 'epcad_index', fileName: files.map(f => f.name).join(', '), rowsIn: r.files.reduce((a, f) => a + f.rows, 0), rowsOk: r.count })
    await epStatus(); applyEpcadAll()
  } catch (e) {
    console.warn(e)
    if (e.code === 'unknown_layout' && files.length === 1 && /\.csv$/i.test(files[0].name)) { out.innerHTML = ''; return csvFlow(files[0], 'epcad') }
    const msg = e.code === 'missing_properties' ? t('i.epcad_need_props') : e.code === 'unknown_layout' ? `${e.file}: ${t('i.epcad_unknown')}` : e.message
    out.innerHTML = `<div class="alert bad">${esc(msg)}</div>`
  }
}
async function applyEpcadAll() {
  const out = $('#eout')
  const list = S.parcels().slice()
  let n = 0, i = 0
  for (const p of list) {
    i++
    if (out && i % 5 === 0) { const el = $('#epprog'); if (el) el.textContent = `${i} / ${list.length}`; else out.insertAdjacentHTML('beforeend', `<div class="muted mono" id="epprog" style="font-size:11.5px">${i} / ${list.length}</div>`) }
    const patch = await EP.patchForAsync(p).catch(() => null)
    if (patch && S.applyEnrichment(p.id, patch, { silent: true })) n++
  }
  S.done()
  $('#epprog')?.remove()
  if (out) out.insertAdjacentHTML('beforeend', `<div class="alert ok">${n} / ${list.length} ${esc(t('i.epcad_matched'))}</div>`)
  toast(`EPCAD: ${n} ${t('i.epcad_matched')}`)
}

// ---------- 04 delinquent taxes ----------
async function taxFile(file) {
  const out = $('#tout'); out.innerHTML = `<div class="alert"><span class="spin"></span> ${esc(t('i.reading'))} ${esc(file.name)}…</div>`
  let rows = []
  try {
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
      const { head, rows: rs } = parseCSV(await file.text())
      rows = parseTaxLines([head.join('  '), ...rs.map(r => head.map(h => r[h]).join('  '))])
    } else {
      const doc = await readDocument(file)
      rows = parseTaxLines(doc.pages.flatMap(p => p.lines))
    }
  } catch (e) { out.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; return }
  const matched = [], unmatched = []
  for (const r of rows) { const p = findByStreet(r.address); (p ? matched : unmatched).push({ r, p }) }
  for (const { r, p } of matched) await S.addTaxes(p.id, [{ entity: 'Tax office list', year: r.years || '', amount: r.amount, delinquent: true, account: r.account }])
  out.innerHTML = `<div class="alert ok">${rows.length} ${esc(t('i.tax_rows'))} · ${matched.length} ${esc(t('i.epcad_matched'))}</div>
    ${unmatched.length ? `<table class="mini">${unmatched.slice(0, 8).map(({ r }) => `<tr><td>${esc(r.address)}</td><td>${esc(r.owner || '')}</td><td class="num">${money(r.amount)}</td></tr>`).join('')}</table><button class="btn sm gold" id="taxnew" style="margin-top:8px">${esc(t('i.tax_new'))} (${unmatched.length})</button>` : ''}`
  S.logImport({ kind: 'tax_list', fileName: file.name, rowsIn: rows.length, rowsOk: matched.length })
  $('#taxnew')?.addEventListener('click', async () => {
    const res = await S.importParcels(unmatched.map(({ r }) => ({ address: r.address, zip: '', owners: r.owner ? [{ name: r.owner }] : [], taxes: [{ entity: 'Tax office list', year: r.years || '', amount: r.amount, delinquent: true }], epcadId: undefined })), { tag: 'tax_delinquent', source: 'tax:' + file.name })
    for (const { r } of unmatched) { const p = findByStreet(r.address); if (p) { const patch = await EP.patchForAsync(p).catch(() => null); if (patch) { S.applyEnrichment(p.id, patch, { silent: true }); if (!p.lat && p.zip) Object.assign(p, jitter(p.zip)) } } }
    S.done(); toast(`${t('i.done')}: ${res.added}`)
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
