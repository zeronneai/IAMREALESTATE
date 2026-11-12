// Tiny IndexedDB key/value helper (large data like the EPCAD index and the DNC list live here, not localStorage).
const DB = 'iam_epcad', STORE = 'kv'
function idb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no_idb'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
export async function kv(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, mode); const st = tx.objectStore(STORE); const q = fn(st); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error) }) }
