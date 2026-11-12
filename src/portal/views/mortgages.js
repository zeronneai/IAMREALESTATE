import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, modal, toast, icon, api, fileToDataURL, dropzone, $ } from '../ui.js'
import { daysUntil } from '../score.js'
import { readDocument } from '../pdfread.js'
import { parseStatement } from '../parse/statement.js'

export function mortgages(el) {
  const inv = S.inventory().filter(v => v.mortgage || (v.statements || []).length)
  const latest = inv.map(v => ({ v, s: (v.statements || []).at(-1) })).filter(x => x.s)
  const totalBal = latest.reduce((a, x) => a + (x.s.balance || 0), 0)
  const monthly = inv.reduce((a, v) => a + ((v.mortgage?.payment || 0) + (v.mortgage?.escrow || 0)), 0)
  const open = inv.flatMap(v => (v.statements || []).filter(s => !s.paid).map(s => ({ v, s }))).sort((a, b) => (a.s.dueDate || '').localeCompare(b.s.dueDate || ''))
  const overdue = open.filter(x => daysUntil(x.s.dueDate) < 0)

  // history: total balance per statement month
  const months = [...new Set(inv.flatMap(v => (v.statements || []).map(s => (s.statementDate || '').slice(0, 7))))].filter(Boolean).sort().slice(-12)
  const series = months.map(m => inv.reduce((a, v) => { const s = [...(v.statements || [])].filter(x => (x.statementDate || '').slice(0, 7) <= m).at(-1); return a + (s?.balance || 0) }, 0))
  const W = 640, H = 170, P = 26
  const mn = Math.min(...series) * 0.995, mx = Math.max(...series) * 1.002
  const x = i => P + (i * (W - P * 2)) / Math.max(1, series.length - 1)
  const y = v => H - P - ((v - mn) / Math.max(1, mx - mn)) * (H - P * 2)
  const path = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  el.innerHTML = `
  <div class="kpis fade-in" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="kpi"><div class="l">${esc(t('k.debt'))}</div><div class="v">${money(totalBal, true)}</div><div class="s">${latest.length} loans</div></div>
    <div class="kpi"><div class="l">${esc(t('m.payment'))} / mo</div><div class="v">${money(monthly, true)}</div><div class="s">P&amp;I + ${esc(t('m.escrow'))}</div></div>
    <div class="kpi ${overdue.length ? 'hero' : ''}"><div class="l">${esc(t('m.overdue'))}</div><div class="v" style="${overdue.length ? 'color:var(--bad)' : ''}">${overdue.length}</div><div class="s">${money(overdue.reduce((a, x) => a + (x.s.amountDue || 0), 0))}</div></div>
    <div class="kpi"><div class="l">${esc(t('k.payments'))}</div><div class="v">${money(open.filter(x => daysUntil(x.s.dueDate) <= 30).reduce((a, x) => a + (x.s.amountDue || 0), 0), true)}</div></div>
  </div>
  <div class="grid-2">
    <div class="card fade-in"><h3>${esc(t('m.history'))}<span class="r mono">${money(totalBal)}</span></h3>
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(t('m.history'))}">
        <defs><linearGradient id="mg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d9a93a" stop-opacity=".35"/><stop offset="1" stop-color="#d9a93a" stop-opacity="0"/></linearGradient></defs>
        ${series.length > 1 ? `<path d="${path} L${x(series.length - 1)},${H - P} L${x(0)},${H - P} Z" fill="url(#mg)"/><path d="${path}" fill="none" stroke="#f0cf74" stroke-width="2"/>` : ''}
        ${series.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#f0cf74"><title>${months[i]}: ${money(v)}</title></circle><text x="${x(i)}" y="${H - 6}" fill="#6f685c" font-size="10" text-anchor="middle" font-family="JetBrains Mono">${months[i].slice(5)}</text>`).join('')}
      </svg>
    </div>
    <div class="card fade-in"><h3>${esc(t('m.upload'))}</h3>
      <div class="f" style="margin-bottom:10px"><label>${esc(t('m.for'))}</label><select id="mfor">${S.inventory().filter(v => v.status !== 'sold').map(v => `<option value="${esc(v.id)}">${esc(v.address)}</option>`).join('')}</select></div>
      <div class="drop" id="mdrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>${esc(t('m.upload_hint'))}</p></div>
      <div class="toolbar" style="margin-top:10px"><span class="muted" style="font-size:12.5px">${esc(t('i.try'))}:</span><button class="btn sm" data-msample>sample-mortgage-statement.pdf</button></div>
    </div>
  </div>
  <div class="tablewrap fade-in" style="max-height:none">
    <table class="dt"><thead><tr><th>${esc(t('m.for'))}</th><th>${esc(t('m.lender'))}</th><th class="num">${esc(t('m.balance'))}</th><th class="num">${esc(t('m.rate'))}</th><th class="num">${esc(t('m.payment'))}</th><th class="num">${esc(t('m.escrow'))}</th><th>${esc(t('m.due'))}</th><th class="num">${esc(t('m.late'))}</th><th></th></tr></thead>
    <tbody>${inv.map(v => { const s = (v.statements || []).at(-1) || {}; const dd = daysUntil(s.dueDate); const st = s.paid ? `<span class="pill ok">${esc(t('m.paid'))}</span>` : dd < 0 ? `<span class="pill bad">${esc(t('m.overdue'))}</span>` : dd <= 10 ? `<span class="pill warn">${esc(t('m.soon'))} · ${dd}d</span>` : `<span class="pill">${dd}d</span>`
      return `<tr style="cursor:default"><td class="addr"><b>${esc(v.address)}</b><span>${(v.statements || []).length} statements</span></td><td>${esc(v.mortgage?.lender || s.lender || 'n/a')} <span class="dim mono">··${esc(v.mortgage?.last4 || '')}</span></td><td class="num">${money(s.balance)}</td><td class="num">${s.rate ?? v.mortgage?.rate ?? 'n/a'}%</td><td class="num">${money(v.mortgage?.payment)}</td><td class="num">${money(s.escrow ?? v.mortgage?.escrow)}</td><td><span class="mono">${esc(date(s.dueDate))}</span> ${st}</td><td class="num">${money(s.lateFee)}</td><td>${!s.paid && s.id ? `<button class="btn sm" data-paid="${esc(v.id)}|${esc(s.id)}">${esc(t('m.mark_paid'))}</button>` : ''}</td></tr>`
    }).join('')}</tbody></table></div>`

  el.querySelectorAll('[data-paid]').forEach(b => b.onclick = () => { const [a, c] = b.dataset.paid.split('|'); S.markPaid(a, c) })
  dropzone($('#mdrop', el), files => handle(files[0], $('#mfor', el).value), { multiple: false, accept: 'application/pdf,image/*' })
  el.querySelector('[data-msample]').onclick = async () => { const r = await fetch('/portal-samples/sample-mortgage-statement.pdf'); handle(new File([await r.blob()], 'sample-mortgage-statement.pdf', { type: 'application/pdf' }), $('#mfor', el).value) }
}

async function handle(file, invId) {
  let data = {}, conf = {}, note = '', score = 0
  const close0 = modal(`<h3>${esc(t('m.reading'))}</h3><div class="boot-bar" style="width:100%"></div><p class="muted" id="mstat">${esc(file.name)}</p>`)
  try {
    const doc = await readDocument(file, pg => { const n = document.getElementById('mstat'); if (n) n.textContent = `${file.name} · ${pg.stage === 'ocr' ? 'OCR ' + (pg.pct ?? 0) + '%' : (pg.page || 1) + '/' + (pg.pages || 1)}` })
    const r = parseStatement(doc.text)
    score = r.score; conf = r.confidence
    const f = r.fields
    data = { lender: f.lender, loan_number_last4: f.last4, statement_date: f.statementDate, payment_due_date: f.dueDate, amount_due: f.amountDue, principal_balance: f.balance, interest_rate: f.rate, principal_and_interest: f.payment, escrow: f.escrow, late_fee: f.lateFee, past_due_amount: f.pastDue }
    conf = { lender: conf.lender, loan_number_last4: conf.last4, statement_date: conf.statementDate, payment_due_date: conf.dueDate, amount_due: conf.amountDue, principal_balance: conf.balance, interest_rate: conf.rate, principal_and_interest: conf.payment, escrow: conf.escrow, late_fee: conf.lateFee, past_due_amount: conf.pastDue }
    if (doc.ocrPages) note = 'OCR'
  } catch (e) { console.warn(e); note = t('toast.err') }
  close0()
  const fld = (k, label, type = 'number', v = data[k]) => `<div class="f conf-${conf[k] || (v != null && v !== '' ? 'high' : 'low')}"><label>${esc(label)}</label><input name="${k}" type="${type}" value="${esc(v ?? '')}" step="any"/></div>`
  modal(`<h3>${esc(t('m.review'))}</h3><div class="alert ${score >= 80 ? 'ok' : ''}">${esc(t('i.conf'))} ${score}% · ${esc(t('s.keyless'))}${note ? ' · ' + esc(note) : ''}</div>
    <form class="form-grid review-item" style="border:0;padding:0;background:none" data-f>
      ${fld('lender', t('m.lender'), 'text')}${fld('loan_number_last4', 'Loan # (last 4)', 'text')}
      ${fld('statement_date', 'Statement date', 'date')}${fld('payment_due_date', t('m.due'), 'date')}
      ${fld('amount_due', 'Amount due')}${fld('principal_balance', t('m.balance'))}
      ${fld('interest_rate', t('m.rate') + ' %')}${fld('principal_and_interest', 'P&I')}
      ${fld('escrow', t('m.escrow'))}${fld('late_fee', t('m.late'))}
      ${fld('past_due_amount', 'Past due')}
      <div class="full" style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>${esc(t('d.close'))}</button><button class="btn gold">${esc(t('m.save'))}</button></div>
    </form>`, (box, close) => {
    box.querySelector('[data-f]').onsubmit = async e => {
      e.preventDefault()
      const f = Object.fromEntries(new FormData(e.target)); const n = k => f[k] === '' ? null : +f[k]
      await S.addStatement(invId, { lender: f.lender, last4: f.loan_number_last4, statementDate: f.statement_date || null, dueDate: f.payment_due_date || null, amountDue: n('amount_due'), balance: n('principal_balance'), rate: n('interest_rate'), payment: n('principal_and_interest'), escrow: n('escrow'), lateFee: n('late_fee'), pastDue: n('past_due_amount'), paid: false, fileName: file.name, extracted: data })
      toast(t('toast.saved')); close()
    }
  })
}
