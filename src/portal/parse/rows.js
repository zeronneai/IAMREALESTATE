// Rebuild text rows from pdf.js text items by position (same approach as the ESC portal's filasDeItems).
// Cells on the same baseline (rounded to 2pt) form a row; a wide horizontal gap becomes 2 spaces (a column break).
export function rowsFromItems(items) {
  const rows = new Map()
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const y = Math.round(it.transform[5] / 2) * 2
    if (!rows.has(y)) rows.set(y, [])
    rows.get(y).push({ x: it.transform[4], w: it.width || 0, s: it.str })
  }
  return [...rows.keys()].sort((a, b) => b - a).map(y => rows.get(y).sort((a, b) => a.x - b.x))
}
export function lineOf(cells) {
  let out = ''
  cells.forEach((c, i) => {
    if (i) {
      const p = cells[i - 1]
      const gap = c.x - (p.x + p.w)
      out += gap > 8 ? '  ' : (gap > 0.8 && !out.endsWith(' ') && !c.s.startsWith(' ') ? ' ' : '')
    }
    out += c.s
  })
  return out.replace(/[ \t]{3,}/g, '  ').trimEnd()
}
export const linesFromItems = items => rowsFromItems(items).map(lineOf)

