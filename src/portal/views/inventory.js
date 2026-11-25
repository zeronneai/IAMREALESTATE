import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, modal, toast, icon, photoUrl } from '../ui.js'
import { CAT, invCat } from '../cats.js'

const STAT = ['acquisition', 'rehab', 'listed', 'rented', 'financed', 'owned', 'sold']
const statCls = { acquisition: 'blue', rehab: 'warn', listed: 'gold', rented: 'ok', financed: 'purple', owned: 'blue', sold: '' }
let filter = ''

export const invMath = v => {
  const months = v.acquiredOn ? Math.max(1, Math.round(((v.soldOn ? new Date(v.soldOn) : new Date()) - new Date(v.acquiredOn)) / (30.4 * 86400000))) : 1
  const holding = (v.holdingMonth || 0) * months
  const invested = (v.purchasePrice || 0) + (v.rehabActual || 0) + holding
  const exit = v.soldPrice || v.listPrice || v.arv || 0
  const sellCost = exit * 0.07
  const profit = exit - sellCost - invested
  return { months, holding, invested, exit, profit, roi: invested ? (profit / invested) * 100 : 0 }
}

export function inventoryView(el) {
  const all = S.inventory()
  // Sold homes are not theirs anymore: only under their own "Sold" filter, never in "All".
  const items = all.filter(v => filter ? v.status === filter : v.status !== 'sold')
  const active = all.filter(v => v.status !== 'sold')
  const tot = active.reduce((a, v) => { const m = invMath(v); a.inv += m.invested; a.arv += v.arv || 0; a.profit += m.profit; a.rent += v.rent || 0; return a }, { inv: 0, arv: 0, profit: 0, rent: 0 })

  el.innerHTML = `
  <div class="kpis fade-in" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="kpi"><div class="l">${esc(t('inv.invested'))}</div><div class="v">${money(tot.inv, true)}</div><div class="s">${active.length} ${esc(t('lists.items'))}</div></div>
    <div class="kpi"><div class="l">${esc(t('inv.arv'))}</div><div class="v">${money(tot.arv, true)}</div></div>
    <div class="kpi hero"><div class="l">${esc(t('inv.profit'))}</div><div class="v">${money(tot.profit, true)}</div><div class="s">${esc(t('inv.roi'))} ${tot.inv ? Math.round((tot.profit / tot.inv) * 100) : 0}%</div></div>
    <div class="kpi"><div class="l">${esc(t('inv.rent'))}</div><div class="v">${money(tot.rent)}</div><div class="s">${all.filter(v => v.status === 'rented').length} ${esc(t('is.rented').toLowerCase())}</div></div>
  </div>
  <div class="pub-banner fade-in"><span class="pub-dot"></span><div><b>${esc(t('pub.live_count'))}: ${all.filter(v => v.published && v.status !== 'sold').length}</b><small>${esc(t('pub.banner'))}</small></div><a class="btn sm" href="/#homes" target="_blank" rel="noopener">${esc(t('pub.see_site'))}</a></div>
  <div class="toolbar">
    <div class="chips"><button class="chip ${!filter ? 'on' : ''}" data-s="">${esc(t('f.all'))} · ${all.filter(v => v.status !== 'sold').length}</button>${STAT.map(s => `<button class="chip ${filter === s ? 'on' : ''}" data-s="${s}">${esc(t('is.' + s))} · ${all.filter(v => v.status === s).length}</button>`).join('')}</div>
    <span class="sp"></span><button class="btn gold" data-add>${icon('plus')}${esc(t('inv.add'))}</button>
  </div>
  <div class="inv-grid">${items.map(v => {
    const m = invMath(v); const over = (v.rehabActual || 0) > (v.rehabBudget || 0)
    const lp = v.parcelId && S.parcel(v.parcelId)
    // Real photos first; if none, the Google Street View photo of the address (until they upload theirs).
    const cover = v.listing?.photos?.[0] || (lp && !lp.demo ? photoUrl(lp, 'street', 640, 300, true) : (!v.demo && v.address ? photoUrl({ address: v.address, zip: v.zip, city: 'El Paso', state: 'TX' }, 'street', 640, 300, true) : null))
    return `<article class="inv fade-in ${v.published ? 'is-pub' : ''}" data-id="${esc(v.id)}" style="--acc:${invCat(v) ? CAT[invCat(v)] : '#9a9a9a'}">
      ${cover ? `<img class="inv-cover" src="${esc(cover)}" alt="" onerror="this.remove()">` : ''}
      <button class="pub-toggle ${v.published ? 'on' : ''}" data-pub="${esc(v.id)}" ${v.status === 'sold' ? 'disabled' : ''} title="${esc(t(v.published ? 'pub.hint_on' : 'pub.hint_off'))}">
        <span class="pt-track"><span class="pt-knob"></span></span><span class="pt-label">${esc(t(v.published ? 'pub.public' : 'pub.internal'))}</span>
      </button>
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><h4>${esc(v.address)}</h4><span class="pill ${statCls[v.status]}">${esc(t('is.' + v.status))}</span></div>
      <div class="row"><span>${esc(t('inv.acquired'))}</span><b>${esc(date(v.acquiredOn))} · ${m.months} mo</b></div>
      <div class="row"><span>${esc(t('inv.purchase'))}</span><b>${money(v.purchasePrice)}</b></div>
      <div><div class="row"><span>${esc(t('inv.rehab'))}</span><b>${money(v.rehabActual)} / ${money(v.rehabBudget)}</b></div><div class="prog ${over ? 'over' : ''}" style="margin-top:6px"><i style="width:${Math.min(100, ((v.rehabActual || 0) / Math.max(1, v.rehabBudget || 1)) * 100)}%"></i></div></div>
      <div class="row"><span>${esc(t('inv.arv'))}${v.soldPrice ? ' / sold' : ''}</span><b>${money(v.soldPrice || v.arv)}</b></div>
      ${v.status === 'rented' ? `<div class="row"><span>${esc(t('inv.tenant'))}</span><b>${esc(v.tenant || 'n/a')} · ${money(v.rent)}/mo</b></div>` : ''}
      ${v.mortgage ? `<div class="row"><span>${esc(t('m.lender'))}</span><b>${esc(v.mortgage.lender)} ··${esc(v.mortgage.last4 || '')}</b></div>` : ''}
      <div class="row" style="border-top:1px solid var(--line);padding-top:10px"><span>${esc(t('inv.profit'))} · ${esc(t('inv.roi'))}</span><b style="color:${m.profit >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(m.profit)} · ${Math.round(m.roi)}%</b></div>
    </article>`
  }).join('')}</div>`

  el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { filter = b.dataset.s; inventoryView(el) })
  el.querySelector('[data-add]').onclick = () => editInventory({ status: 'acquisition', acquiredOn: new Date().toISOString().slice(0, 10), docs: [], statements: [] })
  el.querySelectorAll('.inv').forEach(c => c.onclick = e => { if (!e.target.closest('[data-pub]')) editInventory(S.inventory().find(v => v.id === c.dataset.id)) })
  el.querySelectorAll('[data-pub]').forEach(b => b.onclick = async e => {
    e.stopPropagation()
    const v = S.inventory().find(x => x.id === b.dataset.pub)
    if (v.published) { try { await S.setPublished(v.id, false); toast(t('pub.now_internal')) } catch (err) { toast(err.message) } return }
    publishEditor(v)
  })
}

function editInventory(v) {
  const fld = (k, label, type = 'number', extra = '') => `<div class="f"><label>${esc(label)}</label><input name="${k}" type="${type}" value="${esc(v[k] ?? '')}" ${extra}/></div>`
  modal(`<h3>${esc(v.address || t('inv.add'))}</h3>
  <form class="form-grid" data-f>
    <div class="f full"><label>${esc(t('c.address'))}</label><input name="address" value="${esc(v.address || '')}" required /></div>
    ${fld('zip', 'ZIP', 'text')}
    <div class="f"><label>${esc(t('inv.status'))}</label><select name="status">${STAT.map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${esc(t('is.' + s))}</option>`).join('')}</select></div>
    ${fld('acquiredOn', t('inv.acquired'), 'date')}${fld('purchasePrice', t('inv.purchase'), 'number', 'step="1000"')}
    ${fld('rehabBudget', 'Rehab budget', 'number', 'step="500"')}${fld('rehabActual', 'Rehab actual', 'number', 'step="500"')}
    ${fld('arv', 'ARV', 'number', 'step="1000"')}${fld('listPrice', 'List price', 'number', 'step="1000"')}
    ${fld('soldPrice', 'Sold price', 'number', 'step="1000"')}${fld('soldOn', 'Sold on', 'date')}
    ${fld('tenant', t('inv.tenant'), 'text')}${fld('rent', t('inv.rent'), 'number', 'step="25"')}
    ${fld('holdingMonth', 'Holding cost / month', 'number', 'step="25"')}
    <div class="f full"><label>${esc(t('d.notes'))}</label><input name="notes" value="${esc(v.notes || '')}" /></div>
    <div class="full" style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">${v.id ? `<button type="button" class="btn" data-weblist>${icon('upload')}${esc(t('pub.edit_listing'))}</button>` : '<span></span>'}<span style="display:flex;gap:8px"><button type="button" class="btn ghost" data-close>${esc(t('d.close'))}</button><button class="btn gold">${esc(t('s.save'))}</button></span></div>
  </form>`, (box, close) => {
    box.querySelector('[data-weblist]')?.addEventListener('click', () => { close(); publishEditor(S.inventory().find(x => x.id === v.id), { publishAfter: false }) })
    box.querySelector('[data-f]').onsubmit = async e => {
      e.preventDefault()
      const fd = Object.fromEntries(new FormData(e.target))
      for (const k of ['purchasePrice', 'rehabBudget', 'rehabActual', 'arv', 'listPrice', 'soldPrice', 'rent', 'holdingMonth']) fd[k] = fd[k] === '' ? null : +fd[k]
      await S.saveInventory({ ...v, ...fd }); toast(t('toast.saved')); close()
    }
  })
}

// ---------- publish to the website ----------
const AREAS = ['West Side', 'Eastside', 'Northeast', 'Central', 'Socorro', 'Horizon City', 'Upper Valley', 'Lower Valley', 'Santa Teresa', 'Canutillo']
export function publishEditor(v, { publishAfter = true } = {}) {
  const p = v.parcelId ? S.parcel(v.parcelId) : S.parcels().find(x => x.address && v.address && x.address.toUpperCase() === v.address.toUpperCase())
  const L = { type: v.status === 'rented' ? 'rent' : 'sale', price: v.status === 'rented' ? (v.rent || '') : (v.listPrice || ''), beds: p?.beds || '', baths: p?.baths || '', sqft: p?.sqft || '', year: p?.yearBuilt || '', area: '', desc_en: '', desc_es: '', photos: [], ...(v.listing || {}) }
  L.photos = [...(L.photos || [])]
  modal('<div></div>', (box, close) => {
    const paint = () => {
      box.innerHTML = `<h3>${esc(t('pub.title'))}</h3><p class="muted" style="margin:0">${esc(v.address)} · ${esc(t('pub.lead'))}</p>
      <form class="form-grid" data-pf>
        <div class="f"><label>${esc(t('pub.type'))}</label><select name="type">${['sale', 'rent', 'multi'].map(x => `<option value="${x}" ${L.type === x ? 'selected' : ''}>${esc(t('pub.t_' + x))}</option>`).join('')}</select></div>
        <div class="f"><label>${esc(L.type === 'rent' ? t('pub.rent') : t('pub.price'))} <span class="dim">(${esc(t('own.optional'))})</span></label><input name="price" type="number" step="100" value="${esc(L.price ?? '')}" placeholder="${esc(t('pub.no_price'))}"></div>
        <div class="f"><label>${esc(t('pub.area'))}</label><select name="area"><option value="">El Paso</option>${AREAS.map(a => `<option ${L.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
        <div class="f"><label>${esc(t('pub.beds'))}</label><input name="beds" type="number" step="1" value="${esc(L.beds)}"></div>
        <div class="f"><label>${esc(t('pub.baths'))}</label><input name="baths" type="number" step="0.5" value="${esc(L.baths)}"></div>
        <div class="f"><label>${esc(t('pub.sqft'))}</label><input name="sqft" type="number" step="10" value="${esc(L.sqft)}"></div>
        <div class="f"><label>${esc(t('pub.year'))}</label><input name="year" type="number" step="1" value="${esc(L.year)}"></div>
        ${L.type !== 'rent' ? `<div class="full pub-terms"><label class="chk"><input type="checkbox" name="owner_finance" ${L.owner_finance ? 'checked' : ''}> ${esc(t('pub.of'))}</label>
          <div class="f"><label>${esc(t('pub.down'))}</label><input name="down" type="number" step="100" value="${esc(L.down ?? '')}"></div>
          <div class="f"><label>${esc(t('pub.monthly'))}</label><input name="monthly" type="number" step="10" value="${esc(L.monthly ?? '')}"></div>
          <div class="f"><label>${esc(t('pub.rate'))}</label><input name="rate" type="number" step="0.01" value="${esc(L.rate ?? '')}"></div>
          <div class="f"><label>${esc(t('pub.term'))}</label><input name="term_years" type="number" step="1" value="${esc(L.term_years ?? '')}"></div>
          <div class="f full"><label>${esc(t('pub.terms_note'))}</label><input name="terms_note" value="${esc(L.terms_note || '')}" placeholder="${esc(t('pub.terms_ph'))}"></div></div>` : ''}
        <div class="f full"><label>${esc(t('pub.desc_en'))}</label><textarea name="desc_en" rows="2" placeholder="${esc(t('pub.desc_ph'))}">${esc(L.desc_en)}</textarea></div>
        <div class="f full"><label>${esc(t('pub.desc_es'))}</label><textarea name="desc_es" rows="2">${esc(L.desc_es)}</textarea></div>
        <div class="f full"><label>${esc(t('pub.photos'))} · ${L.photos.length}</label>
          <div class="pub-photos">${L.photos.map((u, i) => `<div class="pub-ph ${i === 0 ? 'cover' : ''}"><img src="${esc(u)}" alt=""><span>${i === 0 ? esc(t('pub.cover')) : ''}</span><button type="button" data-first="${i}" title="${esc(t('pub.make_cover'))}">★</button><button type="button" data-rm="${i}" title="${esc(t('team.remove'))}">×</button></div>`).join('')}
            <label class="pub-add">${icon('plus')}<span>${esc(t('pub.add_photos'))}</span><input type="file" accept="image/*" multiple hidden data-files></label></div>
          <small class="muted">${esc(t('pub.photo_hint'))}</small></div>
        <div class="full" style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;align-items:center"><small class="muted">${esc(t('pub.private_note'))}</small>
          <span style="display:flex;gap:8px"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(publishAfter && !v.published ? t('pub.publish') : t('org.save'))}</button></span></div>
      </form>`
      const f = box.querySelector('[data-pf]')
      const sync = () => { const fd = Object.fromEntries(new FormData(f)); if (f.querySelector('[name=owner_finance]')) fd.owner_finance = !!fd.owner_finance; Object.assign(L, fd) }
      f.querySelector('[name=type]').onchange = () => { sync(); paint() }
      f.querySelector('[data-files]').onchange = async e => {
        sync(); const files = [...e.target.files].slice(0, 20 - L.photos.length)
        const add = f.querySelector('.pub-add span'); add.textContent = t('pub.uploading')
        for (const file of files) { try { L.photos.push(await S.uploadListingPhoto(v.id, file)) } catch (err) { toast(err.message); break } }
        paint()
      }
      f.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { sync(); L.photos.splice(+b.dataset.rm, 1); paint() })
      f.querySelectorAll('[data-first]').forEach(b => b.onclick = () => { sync(); const [x] = L.photos.splice(+b.dataset.first, 1); L.photos.unshift(x); paint() })
      f.onsubmit = async e => {
        e.preventDefault(); sync()
        const num = k => (L[k] === '' || L[k] == null ? null : +L[k])
        const listing = { ...(v.listing || {}), owner_finance: !!L.owner_finance, down: num('down'), monthly: num('monthly'), rate: num('rate'), term_years: num('term_years'), terms_note: String(L.terms_note || '').trim(), type: L.type, price: num('price'), beds: num('beds'), baths: num('baths'), sqft: num('sqft'), year: num('year'), area: L.area || '', desc_en: String(L.desc_en || '').trim(), desc_es: String(L.desc_es || '').trim(), photos: L.photos }
        if (publishAfter && !listing.photos.length) return toast(t('pub.need_photo'))
        try {
          await S.saveListing(v.id, listing)
          if (publishAfter && !v.published) { await S.setPublished(v.id, true); toast(t('pub.now_public')) } else toast(t('org.saved'))
          close()
        } catch (err) { toast(err.message) }
      }
    }
    paint()
  }, { wide: true })
}
