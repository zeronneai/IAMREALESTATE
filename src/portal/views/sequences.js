// Automatic follow ups: build a sequence of texts and emails, enroll owners, see who is where.
import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, toast, modal, date, icon, selection, selChanged } from '../ui.js'
import { openDrawer } from '../drawer.js'
import * as DNC from '../dnc.js'

let curSeq = null, filter = 'active'

export function sequencesView(el) {
  const seqs = S.sequences()
  if (!curSeq || !seqs.some(s => s.id === curSeq)) curSeq = seqs[0]?.id || null
  const seq = seqs.find(s => s.id === curSeq)
  const all = S.enrollments()
  const enr = all.filter(e => e.sequenceId === curSeq && (filter === 'all' || (filter === 'active' ? e.status === 'active' : e.status !== 'active')))
  const cnt = id => all.filter(e => e.sequenceId === id && e.status === 'active').length

  el.innerHTML = `<div class="seq-wrap fade-in">
    <aside class="card seq-side" style="padding:0">
      <div class="ib-head"><b>${esc(t('seq.title'))}</b><button class="btn sm gold" data-new>${icon('plus')}${esc(t('seq.new'))}</button></div>
      ${seqs.map(s => `<button class="ib-th ${s.id === curSeq ? 'on' : ''}" data-s="${esc(s.id)}"><div class="ib-top"><b>${esc(s.name)}</b>${s.active ? '' : `<span class="pill">${esc(t('seq.paused'))}</span>`}</div>
        <div class="ib-sub">${s.steps.length} ${esc(t('seq.steps'))} · ${cnt(s.id)} ${esc(t('seq.in_progress'))}</div></button>`).join('') || `<p class="muted" style="padding:16px">${esc(t('seq.none'))}</p>`}
      <p class="muted seq-help">${esc(t('seq.help'))}</p>
    </aside>
    <section style="display:grid;gap:24px;align-content:start;min-width:0">
      ${seq ? `<div class="card">
        <h3>${esc(seq.name)}<span class="r" style="display:flex;gap:8px"><button class="btn sm ghost" data-edit>${esc(t('seq.edit'))}</button><button class="btn sm gold" data-enroll>${esc(t('seq.add_owners'))}</button></span></h3>
        <div class="seq-steps">${seq.steps.map((st, i) => `<div class="seq-step"><span class="seq-day">${esc(t('seq.day'))} ${+st.day || 0}</span><span class="pill ${st.channel === 'sms' ? 'blue' : ''}">${st.channel === 'sms' ? 'SMS' : 'Email'}</span><p>${esc((st.subject ? st.subject + ' · ' : '') + st.body).slice(0, 180)}</p></div>${i < seq.steps.length - 1 ? '<i class="seq-line"></i>' : ''}`).join('')}</div>
        <p class="muted" style="font-size:12.5px;margin:12px 0 0">${esc(seq.stopOnReply ? t('seq.stops') : t('seq.nostop'))} ${esc(t('seq.when'))}</p>
      </div>
      <div class="card">
        <h3>${esc(t('seq.people'))}<span class="r seg-mini">${['active', 'finished', 'all'].map(f => `<button data-f="${f}" class="${filter === f ? 'on' : ''}">${esc(t('seq.f_' + f))}</button>`).join('')}</span></h3>
        ${enr.length ? `<div class="tbl-wrap"><table class="tbl seq-tbl"><thead><tr><th>${esc(t('c.address'))}</th><th>${esc(t('c.owner'))}</th><th>${esc(t('seq.progress'))}</th><th>${esc(t('seq.next'))}</th><th>${esc(t('c.status'))}</th><th></th></tr></thead><tbody>
          ${enr.map(e => { const p = S.parcel(e.parcelId); const nx = seq.steps[e.step]; return `<tr data-p="${esc(e.parcelId)}"><td><b style="display:block">${esc(p?.address || '')}</b><small class="dim">${esc(e.phone || e.email || '')}</small></td><td>${esc(p?.owners?.[0]?.name || '')}</td>
            <td><span class="seq-prog"><i style="width:${Math.min(100, (e.step / Math.max(1, seq.steps.length)) * 100)}%"></i></span> <span class="dim mono" style="font-size:12px">${Math.min(e.step, seq.steps.length)}/${seq.steps.length}</span></td>
            <td>${e.status === 'active' && nx ? `${esc(date(e.nextAt))} · ${nx.channel === 'sms' ? 'SMS' : 'Email'}` : '<span class="dim">n/a</span>'}</td>
            <td><span class="pill ${{ active: 'ok', replied: 'gold', done: '', stopped: '', opted_out: 'bad', failed: 'bad' }[e.status] || ''}">${esc(t('seq.st_' + e.status))}</span>${e.error ? ` <span class="dim" style="font-size:11px">${esc(e.error)}</span>` : ''}</td>
            <td>${e.status === 'active' ? `<button class="btn sm ghost" data-stop="${esc(e.id)}">${esc(t('seq.stop'))}</button>` : ''}</td></tr>` }).join('')}
        </tbody></table></div>` : `<p class="muted">${esc(t('seq.empty'))}</p>`}
      </div>` : ''}
    </section></div>`

  el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { curSeq = b.dataset.s; sequencesView(el) })
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; sequencesView(el) })
  el.querySelector('[data-new]').onclick = () => editSequence(null, () => sequencesView(el))
  el.querySelector('[data-edit]')?.addEventListener('click', () => editSequence(seq, () => sequencesView(el)))
  el.querySelector('[data-enroll]')?.addEventListener('click', () => {
    if (selection.size) return enrollModal([...selection], seq.id)
    toast(t('seq.pick_first')); location.hash = '#/foreclosures'
  })
  el.querySelectorAll('tr[data-p]').forEach(r => r.onclick = e => { if (!e.target.closest('button')) openDrawer(r.dataset.p) })
  el.querySelectorAll('[data-stop]').forEach(b => b.onclick = async () => { await S.stopEnrollment(b.dataset.stop); toast(t('seq.stopped')); sequencesView(el) })
}

function editSequence(seq, done) {
  const draft = seq ? JSON.parse(JSON.stringify(seq)) : { name: '', steps: [{ day: 0, channel: 'sms', body: '' }], active: true, stopOnReply: true }
  const render = box => {
    box.innerHTML = `<h3>${esc(seq ? t('seq.edit') : t('seq.new'))}</h3>
    <div class="f"><label>${esc(t('seq.name'))}</label><input data-n value="${esc(draft.name)}" required></div>
    <div class="seq-edit">${draft.steps.map((st, i) => `<div class="seq-estep" data-i="${i}">
      <div class="ib-row"><label class="muted" style="align-self:center;font-size:12px">${esc(t('seq.day'))}</label><input type="number" min="0" max="365" data-day value="${+st.day || 0}" style="width:80px">
        <select data-ch><option value="sms" ${st.channel === 'sms' ? 'selected' : ''}>SMS</option><option value="email" ${st.channel === 'email' ? 'selected' : ''}>Email</option></select>
        <button type="button" class="btn sm ghost danger" data-del ${draft.steps.length < 2 ? 'disabled' : ''}>${esc(t('team.remove'))}</button></div>
      ${st.channel === 'email' ? `<input data-subj placeholder="${esc(t('msg.subject'))}" value="${esc(st.subject || '')}">` : ''}
      <textarea data-body rows="3" placeholder="${esc(t('msg.write'))}">${esc(st.body)}</textarea></div>`).join('')}</div>
    <button type="button" class="btn sm ghost" data-add>${icon('plus')}${esc(t('seq.add_step'))}</button>
    <small class="muted">${esc(t('seq.vars'))}</small>
    <label class="chk"><input type="checkbox" data-stop ${draft.stopOnReply ? 'checked' : ''}> ${esc(t('seq.stop_reply'))}</label>
    <label class="chk"><input type="checkbox" data-act ${draft.active ? 'checked' : ''}> ${esc(t('seq.active'))}</label>
    <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">${seq ? `<button type="button" class="btn ghost danger" data-rm>${esc(t('org.delete'))}</button>` : '<span></span>'}<span style="display:flex;gap:8px"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button type="button" class="btn gold" data-save>${esc(t('org.save'))}</button></span></div>`
    const sync = () => { draft.name = box.querySelector('[data-n]').value; box.querySelectorAll('[data-i]').forEach(r => { const st = draft.steps[+r.dataset.i]; st.day = +r.querySelector('[data-day]').value || 0; st.channel = r.querySelector('[data-ch]').value; st.body = r.querySelector('[data-body]').value; const sj = r.querySelector('[data-subj]'); if (sj) st.subject = sj.value }); draft.stopOnReply = box.querySelector('[data-stop]').checked; draft.active = box.querySelector('[data-act]').checked }
    box.querySelectorAll('[data-ch]').forEach(x => x.onchange = () => { sync(); render(box) })
    box.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { sync(); draft.steps.splice(+x.closest('[data-i]').dataset.i, 1); render(box) })
    box.querySelector('[data-add]').onclick = () => { sync(); const last = draft.steps[draft.steps.length - 1]; draft.steps.push({ day: (+last?.day || 0) + 3, channel: 'sms', body: '' }); render(box) }
    box.querySelector('[data-rm]')?.addEventListener('click', async () => { await S.deleteSequence(seq.id); box.closest('.modal').remove(); done() })
    box.querySelector('[data-save]').onclick = async () => {
      sync()
      if (!draft.name.trim() || draft.steps.some(s => !s.body.trim())) return toast(t('seq.fill'))
      draft.steps.sort((a, b) => a.day - b.day)
      try { await S.saveSequence(draft); box.closest('.modal').remove(); toast(t('org.saved')); done() } catch (err) { toast(err.message) }
    }
  }
  modal('<div></div>', box => render(box), { wide: true })
}

// Shared: enroll a set of properties into a sequence (from the batch bar, the drawer or this view).
export function enrollModal(ids, preset) {
  const seqs = S.sequences().filter(s => s.active)
  if (!seqs.length) return toast(t('seq.none'))
  modal(`<h3>${esc(t('seq.add_owners'))}</h3><p class="muted" style="margin:0">${ids.length} ${esc(t('seq.selected'))}</p>
    <div class="f"><label>${esc(t('seq.title'))}</label><select data-q>${seqs.map(s => `<option value="${esc(s.id)}" ${s.id === preset ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <p class="muted" style="font-size:12.5px;margin:0">${esc(t('seq.enroll_note'))}</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold" data-go>${esc(t('seq.start'))}</button></div>`, (box, close) => {
    box.querySelector('[data-go]').onclick = async e => {
      e.currentTarget.disabled = true
      try {
        const r = await S.enroll(box.querySelector('[data-q]').value, ids, v => DNC.isDnc(v))
        close(); toast(`${r.added} ${t('seq.added')}${r.skipped ? ` · ${r.skipped} ${t('seq.skipped')}` : ''}`)
        selection.clear(); selChanged()
      } catch (err) { toast(err.message); e.currentTarget.disabled = false }
    }
  })
}
