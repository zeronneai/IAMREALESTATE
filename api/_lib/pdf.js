import { linesFromItems } from '../../src/portal/parse/rows.js'

// Node / server: extract text lines from a PDF buffer with the pdf.js legacy build (no keys, no AI).
export async function pdfLinesNode(data) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    pages.push(linesFromItems(tc.items))
  }
  await doc.destroy()
  return pages
}
