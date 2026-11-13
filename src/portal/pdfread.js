// Browser PDF / image reader with NO API keys:
//  1) pdf.js pulls the text layer and we rebuild rows by position (like the ESC portal).
//  2) Pages without a text layer (scans, photos) are rendered to a canvas and read with OCR (tesseract.js),
//     loaded only when needed. The OCR engine and English data download from a public CDN the first time.
import { linesFromItems } from './parse/rows.js'

let pdfjsP = null
async function pdfjs() {
  if (!pdfjsP) pdfjsP = (async () => {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })()
  return pdfjsP
}
let ocrP = null
async function ocrWorker(onProgress) {
  if (!ocrP) ocrP = (async () => {
    const { createWorker } = await import('tesseract.js')
    return createWorker('eng', 1, { logger: m => { if (m.status === 'recognizing text') onProgress?.({ stage: 'ocr', pct: Math.round(m.progress * 100) }) } })
  })()
  return ocrP
}
async function ocrCanvas(canvas, onProgress) {
  const w = await ocrWorker(onProgress)
  const { data } = await w.recognize(canvas)
  return data.text.split('\n').map(s => s.replace(/\s+$/, '')).filter(s => s.trim())
}

// Returns { pages: [{ lines, ocr }], text, ocrPages }
export async function readDocument(file, onProgress) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) {
    onProgress?.({ stage: 'ocr', pct: 0 })
    const bmp = await createImageBitmap(file)
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    const lines = await ocrCanvas(c, onProgress)
    return { pages: [{ lines, ocr: true }], text: lines.join('\n'), ocrPages: 1 }
  }
  const lib = await pdfjs()
  // wasmUrl is required by pdf.js 5 to decode county scans (CCITT/JBIG2 fax images); without it pages render blank.
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: '/pdfjs/wasm/', standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise
  const pages = []
  let ocrPages = 0
  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.({ stage: 'text', page: i, pages: doc.numPages })
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    let lines = linesFromItems(tc.items)
    let ocr = false
    if (lines.join('').replace(/\s/g, '').length < 25) {
      const vp = page.getViewport({ scale: 2.2 })
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      onProgress?.({ stage: 'ocr', page: i, pages: doc.numPages, pct: 0 })
      lines = await ocrCanvas(c, onProgress)
      ocr = true; ocrPages++
    }
    pages.push({ lines, ocr })
  }
  await doc.destroy()
  // pages joined with a form feed so packets can be split per notice
  return { pages, text: pages.map(p => p.lines.join('\n')).join('\n\f\n'), ocrPages }
}
