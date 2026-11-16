// County search: find homes across all of El Paso County (EPCAD index) and turn them into leads.
import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, toast, modal, icon } from '../ui.js'
import { patchFromDump } from '../parse/epcad.js'
import { jitter } from './importer.js'

const PAGE = 100
let F = { zips: '', absentee: false, out_of_area: false, over65: false, homestead: '', years_owned: '', value_min: '', value_max: '', built_before: '', built_after: '', sqft_min: '', owner: '', owner_type: '', sort: 'deed' }
let res = { rows: [], total: 0, loading: false, error: '', searched: false }
const picked = new Set()

const yearsOwned = d => (d ? Math.max(0, Math.floor((Date.now() - new Date(d)) / (365.25 * 86400e3))) : null)
const nice = s => String(s || '').toLowerCase().replace(/(^|[\s\-'/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())

function params() {
  const f = {}
  const zips = F.zips.split(/[\s,;]+/).map(z => z.trim()).filter(z => /^\d{5}$/.test(z))
  if (zips.length) f.zips = zips
  for (const k of ['absentee', 'out_of_area', 'over65']) if (F[k]) f[k] = true
  if (F.homestead !== '') f.homestead = F.homestead === 'yes'
  for (const k of ['years_owned', 'value_min', 'value_max', 'built_before', 'built_after', 'sqft_min']) if (F[k] !== '' && !isNaN(+F[k])) f[k] = +F[k]
  if (F.owner.trim()) f.owner = F.owner.trim().toUpperCase()
  if (F.owner_type) f.owner_type = F.owner_type
  f.sort = F.sort
  return f
}

// Demo: the same filters over a generated sample so the screen can be shown without the county data.
function demoRows(f) {
  const own = ['MARIA GARCIA', 'SUN CITY HOLDINGS LLC', 'ESTATE OF JOSE RAMIREZ', 'ROBERT AND LINDA SMITH', 'DESERT ROSE TRUST', 'LUIS HERNANDEZ', 'FRANKLIN INVESTMENTS LLC', 'ANA TORRES', 'HEIRS OF PEDRO LUNA', 'JAMES MILLER']
  const st = ['MONTANA AVE', 'DYER ST', 'ZARAGOZA RD', 'GATEWAY BLVD E', 'HONDO PASS AVE', 'LEE TREVINO DR', 'PELLICANO DR', 'MESA ST', 'ALAMEDA AVE', 'YARBROUGH DR']
  const zs = ['79936', '79925', '79924', '79907', '79912', '79938', '79903', '79915']
  const rows = []
  for (let i = 0; i < 240; i++) {
    const o = own[(i * 7) % own.length], z = zs[(i * 3) % zs.length], abs = i % 3 === 0, out = abs && i % 2 === 0
    rows.push({ prop_id: String(500000 + i), situs: `${1000 + ((i * 37) % 9000)} ${st[i % st.length]}`, zip: z, owners: [o], mailing: out ? `${100 + i} ELM ST DALLAS TX 75201` : abs ? `${200 + i} OAK AVE EL PASO TX 79912` : '', mailing_zip: out ? '75201' : abs ? '79912' : z, absentee: abs, homestead: !abs && i % 4 !== 1, over65: i % 5 === 0, year_built: 1950 + ((i * 13) % 70), living_sqft: 900 + ((i * 53) % 2400), land_sqft: 6000, last_deed_date: `${1975 + ((i * 11) % 50)}-0${1 + (i % 9)}-15`, market_value: 90000 + ((i * 9173) % 330000) })
  }
  const re = { company: /\b(LLC|INC|HOLDINGS|INVESTMENTS)\b/, trust: /\bTRUST\b/, estate: /\b(ESTATE|HEIRS)\b/ }
  let r = rows.filter(x => (!f.zips || f.zips.includes(x.zip)) && (!f.absentee || x.absentee) && (!f.out_of_area || !/^79[89]/.test(x.mailing_zip)) && (!f.over65 || x.over65)
    && (f.homestead == null || x.homestead === f.homestead) && (!f.years_owned || yearsOwned(x.last_deed_date) >= f.years_owned) && (!f.value_min || x.market_value >= f.value_min)
    && (!f.value_max || x.market_value <= f.value_max) && (!f.built_before || x.year_built <= f.built_before) && (!f.built_after || x.year_built >= f.built_after)
    && (!f.sqft_min || x.living_sqft >= f.sqft_min) && (!f.owner || x.owners.join(' ').includes(f.owner))
    && (!f.owner_type || (f.owner_type === 'person' ? !Object.values(re).some(rx => rx.test(x.owners[0])) : re[f.owner_type].test(x.owners[0]))))
  r.sort((a, b) => f.sort === 'value' ? b.market_value - a.market_value : f.sort === 'value_asc' ? a.market_value - b.market_value : a.last_deed_date.localeCompare(b.last_deed_date))
  return r.map(x => ({ ...x, total: r.length }))
}

async function search(el, more = false) {
  res.loading = true; res.error = ''; if (!more) { res.rows = []; picked.clear() }
  paint(el)
  const f = params()
  try {
    let rows
    if (S.MODE === 'demo') rows = demoRows(f).slice(res.rows.length, res.rows.length + PAGE)
    else {
      const { data, error } = await S.client().rpc('county_search', { f, lim: PAGE, off: res.rows.length })
      if (error) throw new Error(/function|schema cache/i.test(error.message) ? t('cs.e_sql') : /timeout/i.test(error.message) ? t('cs.e_slow') : t('team.e_error'))
      rows = data || []
    }
    res.rows = more ? [...res.rows, ...rows] : rows
    res.total = rows[0]?.total ?? (more ? res.total : 0)
  } catch (e) { res.error = e.message }
  res.loading = false; res.searched = true
  paint(el)
}

export function countyView(el) { paint(el) }

function paint(el) {
  const chk = (k) => `<label class="check"><input type="checkbox" data-k="${k}" ${F[k] ? 'checked' : ''}/>${esc(t('cs.' + k))}</label>`
  const inp = (k, ph, type = 'number') => `<div class="f"><label>${esc(t('cs.' + k))}</label><input data-k="${k}" type="${type}" value="${esc(F[k])}" placeholder="${esc(ph || '')}"></div>`
  const inLeads = new Set(S.parcels().map(p => String(p.epcadId || '')))
  el.innerHTML = `
  <div class="card fade-in cs-filters">
    <div class="cs-head"><div><h3 style="margin:0">${esc(t('cs.title'))}</h3><p class="lead" style="margin:4px 0 0">${esc(t('cs.lead'))}</p></div></div>
    <div class="cs-grid">
      ${inp('zips', '79936, 79925', 'text')}
      <div class="f"><label>${esc(t('cs.owner_type'))}</label><select data-k="owner_type">${['', 'person', 'company', 'trust', 'estate'].map(v => `<option value="${v}" ${F.owner_type === v ? 'selected' : ''}>${esc(t('cs.ot_' + (v || 'any')))}</option>`).join('')}</select></div>
      ${inp('years_owned', '15')}
      <div class="f"><label>${esc(t('cs.homestead'))}</label><select data-k="homestead"><option value="">${esc(t('cs.ot_any'))}</option><option value="yes" ${F.homestead === 'yes' ? 'selected' : ''}>${esc(t('cs.hs_yes'))}</option><option value="no" ${F.homestead === 'no' ? 'selected' : ''}>${esc(t('cs.hs_no'))}</option></select></div>
      ${inp('value_min', '$')}${inp('value_max', '$')}${inp('built_before', '1980')}${inp('sqft_min', '1200')}
      ${inp('owner', t('cs.owner_ph'), 'text')}
      <div class="f"><label>${esc(t('cs.sort'))}</label><select data-k="sort">${['deed', 'value', 'value_asc'].map(v => `<option value="${v}" ${F.sort === v ? 'selected' : ''}>${esc(t('cs.s_' + v))}</option>`).join('')}</select></div>
    </div>
    <div class="cs-checks">${chk('absentee')}${chk('out_of_area')}${chk('over65')}
      <span class="sp"></span><button class="btn ghost" data-reset>${esc(t('f.reset'))}</button><button class="btn gold" data-search>${icon('search')}${esc(t('cs.search'))}</button></div>
    <div class="cs-presets"><span class="muted">${esc(t('cs.presets'))}:</span>${['tired', 'absentee_out', 'estates', 'seniors', 'companies'].map(p => `<button class="chip" data-preset="${p}">${esc(t('cs.p_' + p))}</button>`).join('')}</div>
  </div>
  <div class="card fade-in" style="margin-top:20px">
    ${res.loading && !res.rows.length ? `<p class="muted"><span class="spin"></span> ${esc(t('cs.searching'))}</p>`
      : res.error ? `<div class="alert bad">${esc(res.error)}</div>`
      : !res.searched ? `<p class="muted">${esc(t('cs.hint'))}</p>`
      : !res.rows.length ? `<p class="muted">${esc(t('cs.none'))}</p>`
      : `<div class="cs-bar"><b>${(+res.total).toLocaleString()} ${esc(t('cs.found'))}</b><span class="muted">${esc(t('cs.showing'))} ${res.rows.length}</span><span class="sp"></span>
          <button class="btn sm ghost" data-pickall>${esc(t('cs.pick_all'))}</button>
          <button class="btn sm gold" data-add ${picked.size ? '' : 'disabled'}>${icon('plus')}${esc(t('cs.add'))} (${picked.size})</button></div>
        <div class="tbl-wrap"><table class="seq-tbl cs-tbl"><thead><tr><th></th><th>${esc(t('c.address'))}</th><th>${esc(t('c.owner'))}</th><th>${esc(t('cs.mail'))}</th><th class="num">${esc(t('c.years'))}</th><th class="num">${esc(t('c.built'))}</th><th class="num">${esc(t('cs.sqft'))}</th><th class="num">${esc(t('c.value'))}</th><th></th></tr></thead><tbody>
        ${res.rows.map(r => { const have = inLeads.has(String(r.prop_id)); return `<tr class="${have ? 'have' : ''}"><td><input type="checkbox" data-p="${esc(r.prop_id)}" ${picked.has(r.prop_id) ? 'checked' : ''} ${have ? 'disabled' : ''}></td>
          <td><b style="display:block">${esc(nice(r.situs))}</b><small class="dim">${esc(r.zip || '')}</small></td>
          <td>${esc(nice((r.owners || [])[0] || ''))}${(r.owners || []).length > 1 ? ` <span class="dim">+${r.owners.length - 1}</span>` : ''}</td>
          <td>${r.absentee ? `<span class="pill blue">${esc(/^(798|799|885)/.test(r.mailing_zip || '') ? t('cs.absent_local') : t('cs.absent_out'))}</span>` : `<span class="dim">${esc(t('cs.lives_there'))}</span>`}</td>
          <td class="num">${yearsOwned(r.last_deed_date) ?? 'n/a'}</td><td class="num">${r.year_built || 'n/a'}</td><td class="num">${r.living_sqft ? (+r.living_sqft).toLocaleString() : 'n/a'}</td><td class="num">${r.market_value ? money(+r.market_value) : 'n/a'}</td>
          <td>${r.over65 ? '<span class="pill gold">65+</span>' : ''}${r.homestead ? ' <span class="pill">HS</span>' : ''}${have ? ` <span class="pill ok">${esc(t('cs.in_leads'))}</span>` : ''}</td></tr>` }).join('')}
        </tbody></table></div>
        ${res.rows.length < res.total ? `<div style="display:flex;justify-content:center;margin-top:14px"><button class="btn" data-more ${res.loading ? 'disabled' : ''}>${res.loading ? '<span class="spin"></span>' : ''}${esc(t('cs.more'))}</button></div>` : ''}`}
  </div>`

  el.querySelectorAll('[data-k]').forEach(x => x.onchange = () => { F[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.value })
  el.querySelectorAll('input[data-k]').forEach(x => x.onkeydown = e => { if (e.key === 'Enter') { F[x.dataset.k] = x.value; search(el) } })
  el.querySelector('[data-search]').onclick = () => search(el)
  el.querySelector('[data-reset]').onclick = () => { for (const k in F) F[k] = typeof F[k] === 'boolean' ? false : k === 'sort' ? 'deed' : ''; res = { rows: [], total: 0, searched: false }; picked.clear(); paint(el) }
  el.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    const keep = F.zips
    for (const k in F) F[k] = typeof F[k] === 'boolean' ? false : k === 'sort' ? 'deed' : ''
    F.zips = keep
    Object.assign(F, { tired: { years_owned: '20', owner_type: 'person' }, absentee_out: { absentee: true, out_of_area: true }, estates: { owner_type: 'estate' }, seniors: { over65: true, years_owned: '15' }, companies: { owner_type: 'company', absentee: true } }[b.dataset.preset])
    search(el)
  })
  el.querySelectorAll('[data-p]').forEach(c => c.onchange = () => { c.checked ? picked.add(c.dataset.p) : picked.delete(c.dataset.p); const b = el.querySelector('[data-add]'); b.disabled = !picked.size; b.lastChild.textContent = `${t('cs.add')} (${picked.size})` })
  el.querySelector('[data-pickall]')?.addEventListener('click', () => { res.rows.forEach(r => { if (!inLeads.has(String(r.prop_id))) picked.add(r.prop_id) }); paint(el) })
  el.querySelector('[data-more]')?.addEventListener('click', () => search(el, true))
  el.querySelector('[data-add]')?.addEventListener('click', () => addModal(el))
}

function addModal(el) {
  const rows = res.rows.filter(r => picked.has(r.prop_id))
  const auto = new Set(); if (rows.some(r => r.absentee)) auto.add('absentee'); if (F.owner_type === 'estate') auto.add('probate')
  modal(`<h3>${esc(t('cs.add_title'))}</h3><p class="muted" style="margin:0">${rows.length} ${esc(t('cs.add_lead'))}</p>
    <div class="f"><label>${esc(t('cs.tags'))}</label><div class="np-tags">${['absentee', 'probate', 'high_equity', 'vacant', 'tax_delinquent'].map(x => `<label class="chk"><input type="checkbox" name="tags" value="${x}" ${auto.has(x) ? 'checked' : ''}> ${esc(t('tag.' + x))}</label>`).join('')}</div></div>
    <div class="f"><label>${esc(t('cs.list'))} <span class="dim">(${esc(t('own.optional'))})</span></label><input data-list placeholder="${esc(t('cs.list_ph'))}"></div>
    <p class="muted" style="margin:0;font-size:12.5px">${esc(t('cs.add_note'))}</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold" data-go>${esc(t('cs.add'))}</button></div>`, (box, close) => {
    box.querySelector('[data-go]').onclick = async e => {
      const btn = e.currentTarget; btn.disabled = true
      const tags = [...box.querySelectorAll('[name=tags]:checked')].map(x => x.value), listName = box.querySelector('[data-list]').value.trim()
      const out = []
      for (const r of rows) {
        const pt = patchFromDump(r, { zip: r.zip }) || {}
        const owners = [pt.owner, ...(pt.extraOwners || []).map(n => ({ name: n, mailing: pt.owner?.mailing || '', absentee: !!r.absentee }))].filter(o => o?.name)
        out.push({ address: String(r.situs).toUpperCase(), zip: r.zip || '', epcadId: r.prop_id, marketValue: pt.marketValue ?? null, valueEstimated: !!pt.valueEstimated, yearBuilt: pt.yearBuilt ?? null, sqft: pt.sqft ?? null, lot: pt.lot ?? null, lastDeedDate: pt.lastDeedDate ?? null, legal: pt.legal ?? null, homestead: !!r.homestead, owners, tags, ...jitter(r.zip) })
      }
      let done = 0
      const step = 25
      for (let i = 0; i < out.length; i += step) { await S.importParcels(out.slice(i, i + step), { tag: tags[0] || null, source: 'county_search' }); done += Math.min(step, out.length - i); btn.textContent = `${done}/${out.length}` }
      S.touch()
      if (listName) { const ids = S.parcels().filter(p => out.some(o => o.epcadId === String(p.epcadId))).map(p => p.id); await S.createList(listName, ids) }
      close(); picked.clear(); toast(`${out.length} ${t('cs.added')}`); paint(el)
    }
  })
}
