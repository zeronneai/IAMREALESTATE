// Direct mail generator, all in the browser (jsPDF): letters 8.5x11, postcards 6x9, Avery 5160 labels,
// plus address CSV for print and mail vendors (Lob, Click2Mail). Templates are editable in Settings.
// Copy is written to be honest and calm: private company, not a lender or government office, with an opt out line.
export const DEFAULT_TEMPLATES = {
  en: {
    letterSubject: 'About your home at {{address}}',
    letter: `Dear {{owner}},

My name is {{agent}} and I work with {{company}}, a local real estate company here in El Paso. I am reaching out because public county records show a notice related to your property at {{address}}{{sale_line}}.

Every situation is different, and you may already have a plan. If it would help to talk through your options, we can explain them in plain language: staying in the home, working with your lender, selling to a buyer on the market, or selling to us for cash on a timeline that works for you. There is no cost and no obligation to talk.

You can reach me directly at {{phone}} or {{email}}. We speak English and Spanish.

Respectfully,

{{agent}}
{{company}} · {{office}}`,
    postcardFront: 'Questions about your home at {{address}}?',
    postcard: `Hi {{owner}}, we are {{company}}, a local El Paso real estate company. If you are weighing your options for this property, we can walk you through them at no cost: keep it, sell on the market, or a cash sale on your timeline. Call or text {{agent}} at {{phone}}.`,
    disclaimer: 'This is a solicitation from a private real estate company. We are not your lender, a government agency or a law firm, and this is not legal advice. To stop mail from us, call or text STOP to {{phone}} or email {{email}}.',
  },
  es: {
    letterSubject: 'Sobre su casa en {{address}}',
    letter: `Estimado(a) {{owner}}:

Mi nombre es {{agent}} y trabajo con {{company}}, una empresa local de bienes raíces aquí en El Paso. Le escribo porque los registros públicos del condado muestran un aviso relacionado con su propiedad en {{address}}{{sale_line}}.

Cada situación es distinta y es posible que usted ya tenga un plan. Si le sirve platicar sus opciones, se las explicamos con palabras sencillas: quedarse en la casa, trabajar con su banco, venderla en el mercado o vendérnosla en efectivo en el tiempo que a usted le convenga. Platicar no tiene costo ni compromiso.

Puede comunicarse directamente conmigo al {{phone}} o a {{email}}. Hablamos español e inglés.

Atentamente,

{{agent}}
{{company}} · {{office}}`,
    postcardFront: '¿Preguntas sobre su casa en {{address}}?',
    postcard: `Hola {{owner}}, somos {{company}}, una empresa local de bienes raíces en El Paso. Si está considerando opciones para esta propiedad, se las explicamos sin costo: conservarla, venderla en el mercado o una venta en efectivo a su ritmo. Llame o mande mensaje a {{agent}} al {{phone}}.`,
    disclaimer: 'Esta es una comunicación de una empresa privada de bienes raíces. No somos su banco, una oficina de gobierno ni un despacho de abogados, y esto no es asesoría legal. Para no recibir más correo, llame o mande STOP al {{phone}} o escriba a {{email}}.',
  },
}
export const DEFAULT_SENDER = { company: 'I AM Real Estate', agent: 'Angeline Gomez', phone: '(915) 348-3560', email: 'info@iamrealestate.co', office: '1522 Montana Ave, El Paso, TX 79902' }

const fmtSale = (iso, lang) => { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }
const nice = s => String(s || '').toLowerCase().replace(/(^|[\s\-'/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\bMc(\p{L})/gu, (m, a) => 'Mc' + a.toUpperCase()).replace(/\b(Ii|Iii|Iv)\b/g, m => m.toUpperCase()).replace(/\b(Po Box|Nw|Ne|Sw|Se)\b/g, m => m.toUpperCase())

// Who and where to mail: owner mailing address if we have it (absentee owners), otherwise the property.
export function recipient(p) {
  const o = p.owners?.[0] || {}
  const names = (p.owners || []).map(x => nice(x.name)).filter(Boolean)
  const useMail = !!(o.mailing && o.mailing.trim())
  return {
    name: names.slice(0, 2).join(' & ') || 'Current Resident',
    line1: useMail ? nice(o.mailing) : nice(p.address),
    city: nice(useMail ? (o.mailingCity || p.city) : p.city) || 'El Paso',
    state: (useMail ? (o.mailingState || p.state) : p.state) || 'TX',
    zip: (useMail ? (o.mailingZip || p.zip) : p.zip) || '',
  }
}
export function merge(tpl, p, sender, lang) {
  const r = recipient(p)
  const sale = p.foreclosure?.saleDate ? (lang === 'es' ? `, con fecha de subasta programada para el ${fmtSale(p.foreclosure.saleDate, lang)}` : `, with a sale date listed for ${fmtSale(p.foreclosure.saleDate, lang)}`) : ''
  const vals = { owner: r.name, address: nice(p.address), city: nice(p.city || 'El Paso'), sale_date: fmtSale(p.foreclosure?.saleDate, lang), sale_line: sale, ...sender }
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] ?? '')
}

async function jspdf() { const m = await import('jspdf'); return m.jsPDF || m.default }

// kind: 'letter' | 'postcard' | 'labels'
export async function buildPdf(kind, parcels, { lang = 'en', templates, sender }) {
  const T = { ...DEFAULT_TEMPLATES[lang], ...(templates?.[lang] || {}) }
  const S = { ...DEFAULT_SENDER, ...(sender || {}) }
  const JsPDF = await jspdf()
  if (kind === 'labels') return labels(JsPDF, parcels)
  if (kind === 'postcard') return postcards(JsPDF, parcels, T, S, lang)
  const doc = new JsPDF({ unit: 'pt', format: 'letter' })
  parcels.forEach((p, i) => {
    if (i) doc.addPage()
    const r = recipient(p), W = 612
    doc.setFillColor(13, 13, 13); doc.rect(0, 0, W, 6, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20, 20, 20); doc.text(S.company, 64, 64)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 110, 110); doc.text(`${S.office}  ·  ${S.phone}  ·  ${S.email}`, 64, 78)
    doc.setTextColor(20, 20, 20); doc.setFontSize(10.5)
    doc.text(new Date().toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }), 64, 120)
    // window envelope friendly address block (#10 window)
    doc.text([r.name, r.line1, `${r.city}, ${r.state} ${r.zip}`], 64, 160)
    doc.setFont('helvetica', 'bold'); doc.text(merge(T.letterSubject, p, S, lang), 64, 236)
    doc.setFont('helvetica', 'normal')
    const body = doc.splitTextToSize(merge(T.letter, p, S, lang), W - 128)
    doc.text(body, 64, 262, { lineHeightFactor: 1.45 })
    doc.setFontSize(8); doc.setTextColor(120, 120, 120)
    doc.text(doc.splitTextToSize(merge(T.disclaimer, p, S, lang), W - 128), 64, 742, { lineHeightFactor: 1.35 })
  })
  return doc
}

function postcards(JsPDF, parcels, T, S, lang) {
  // 6x9 in = 648x432 pt; page 1 front, page 2 back (address side), per recipient
  const doc = new JsPDF({ unit: 'pt', format: [648, 432], orientation: 'landscape' })
  parcels.forEach((p, i) => {
    if (i) doc.addPage([648, 432], 'landscape')
    doc.setFillColor(13, 13, 13); doc.rect(0, 0, 648, 432, 'F')
    doc.setFillColor(212, 160, 23); doc.rect(36, 36, 6, 360, 'F')
    doc.setTextColor(244, 241, 234); doc.setFont('helvetica', 'bold'); doc.setFontSize(30)
    doc.text(doc.splitTextToSize(merge(T.postcardFront, p, S, lang), 520), 60, 120, { lineHeightFactor: 1.15 })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(242, 210, 122)
    doc.text(`${S.company}  ·  ${S.phone}`, 60, 372)
    doc.addPage([648, 432], 'landscape')
    const r = recipient(p)
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, 648, 432, 'F')
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(S.company, 36, 50)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(S.office, 36, 64)
    doc.setFontSize(11); doc.text(doc.splitTextToSize(merge(T.postcard, p, S, lang), 270), 36, 110, { lineHeightFactor: 1.4 })
    doc.setFontSize(7); doc.setTextColor(110, 110, 110); doc.text(doc.splitTextToSize(merge(T.disclaimer, p, S, lang), 270), 36, 360, { lineHeightFactor: 1.3 })
    // USPS: keep the right half lower area clear for address and barcode; postage box top right
    doc.setDrawColor(160, 160, 160); doc.rect(540, 28, 72, 54)
    doc.setFontSize(7); doc.text('POSTAGE', 557, 58)
    doc.setTextColor(20, 20, 20); doc.setFontSize(11)
    doc.text([r.name, r.line1, `${r.city}, ${r.state} ${r.zip}`], 360, 250, { lineHeightFactor: 1.35 })
  })
  return doc
}

function labels(JsPDF, parcels) {
  // Avery 5160: 3 x 10 labels, 2.625 x 1 in, top margin 0.5 in, left 0.1875 in, column pitch 2.75 in
  const doc = new JsPDF({ unit: 'in', format: 'letter' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  parcels.forEach((p, i) => {
    const k = i % 30
    if (i && k === 0) doc.addPage()
    const col = k % 3, row = Math.floor(k / 3)
    const x = 0.1875 + col * 2.75 + 0.12, y = 0.5 + row * 1 + 0.3
    const r = recipient(p)
    doc.text([r.name.slice(0, 34), r.line1.slice(0, 36), `${r.city}, ${r.state} ${r.zip}`], x, y, { lineHeightFactor: 1.2 })
  })
  return doc
}

export function vendorCSV(parcels, vendor) {
  const rows = vendor === 'lob'
    ? [['name', 'address_line1', 'address_line2', 'address_city', 'address_state', 'address_zip', 'address_country', 'property_address']]
    : [['Name', 'Address1', 'Address2', 'City', 'State', 'Zip', 'PropertyAddress']]
  parcels.forEach(p => { const r = recipient(p); rows.push(vendor === 'lob' ? [r.name, r.line1, '', r.city, r.state, r.zip, 'US', p.address] : [r.name, r.line1, '', r.city, r.state, r.zip, p.address]) })
  return rows
}
