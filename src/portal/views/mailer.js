// Direct mail modal: pick format and language, preview the real PDF, download, or export vendor CSV.
import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, modal, toast, download, toCSV } from '../ui.js'
import { buildPdf, vendorCSV, recipient } from '../mail.js'

export function openMailer(ids) {
  const ps = ids.map(S.parcel).filter(Boolean)
  if (!ps.length) return
  let kind = 'letter', lang = getLang(), url = null
  modal(`<h3>${esc(t('mail.title'))} <span class="muted" style="font-weight:400">· ${ps.length} ${esc(t('mail.to'))}</span></h3>
    <div class="mail-grid">
      <div style="display:grid;gap:12px;align-content:start">
        <div class="f"><label>${esc(t('mail.kind'))}</label><div class="seg" data-seg="kind"><button data-v="letter" class="on">${esc(t('mail.letter'))}</button><button data-v="postcard">${esc(t('mail.postcard'))}</button><button data-v="labels">5160</button></div></div>
        <div class="f"><label>${esc(t('mail.lang'))}</label><div class="seg" data-seg="lang"><button data-v="en" class="${lang === 'en' ? 'on' : ''}">English</button><button data-v="es" class="${lang === 'es' ? 'on' : ''}">Español</button></div></div>
        <p class="muted" style="font-size:12px;margin:0">${esc(t('mail.note'))}</p>
        <div class="tablewrap" style="max-height:210px"><table class="mini">${ps.slice(0, 40).map(p => { const r = recipient(p); return `<tr><td><b>${esc(r.name)}</b><br/><span class="muted" style="font-size:11.5px">${esc(r.line1)}, ${esc(r.city)} ${esc(r.zip)}</span></td></tr>` }).join('')}</table></div>
        <button class="btn gold" data-dl>${esc(t('mail.download'))}</button>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-csv="lob">${esc(t('mail.csv_lob'))}</button><button class="btn sm" data-csv="c2m">${esc(t('mail.csv_c2m'))}</button></div>
        <button class="btn ghost" data-close>${esc(t('d.close'))}</button>
      </div>
      <div><iframe class="mail-prev" title="${esc(t('mail.preview'))}"></iframe></div>
    </div>`, (box, close) => {
    const frame = box.querySelector('iframe')
    const opts = () => ({ lang, templates: S.settings().mailTemplates, sender: S.settings().mailSender })
    const render = async () => {
      const doc = await buildPdf(kind, ps.slice(0, 6), opts())
      if (url) URL.revokeObjectURL(url)
      url = URL.createObjectURL(doc.output('blob'))
      frame.src = url + '#view=FitH'
    }
    box.querySelectorAll('[data-seg]').forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b))
      if (seg.dataset.seg === 'kind') kind = b.dataset.v; else lang = b.dataset.v
      render()
    }))
    box.querySelector('[data-dl]').onclick = async () => {
      const doc = await buildPdf(kind, ps, opts())
      doc.save(`iam-${kind}-${lang}-${new Date().toISOString().slice(0, 10)}.pdf`)
      for (const p of ps) S.addActivity(p.id, 'mail', `${t('mail.' + kind)} (${lang.toUpperCase()})`)
      toast(t('mail.logged'))
    }
    box.querySelectorAll('[data-csv]').forEach(b => b.onclick = () => download(`iam-mail-${b.dataset.csv}.csv`, toCSV(vendorCSV(ps, b.dataset.csv))))
    render().catch(e => { console.warn(e); toast(t('toast.err')) })
    void close
  }, { wide: true })
}
