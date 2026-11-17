/* Archivio nel browser (IndexedDB). Ogni persona ha il suo: per condividere si usa il file .oe (src/local/file.ts). */

const NAME = 'impaginatore-oe'
const STORES = ['docs', 'versions', 'assets', 'comments', 'handles'] as const
type Store = (typeof STORES)[number]
let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, 1)
    r.onupgradeneeded = () => {
      const db = r.result
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) {
        const os = db.createObjectStore(s, { keyPath: s === 'handles' ? 'docId' : 'id' })
        if (s !== 'docs' && s !== 'handles') os.createIndex('docId', 'docId')
      }
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  }))
}

const p = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

export async function all<T>(s: Store): Promise<T[]> {
  const db = await open()
  return p(db.transaction(s).objectStore(s).getAll()) as Promise<T[]>
}
export async function byDoc<T>(s: Store, docId: string): Promise<T[]> {
  const db = await open()
  return p(db.transaction(s).objectStore(s).index('docId').getAll(docId)) as Promise<T[]>
}
export async function get<T>(s: Store, id: string): Promise<T | undefined> {
  const db = await open()
  return p(db.transaction(s).objectStore(s).get(id)) as Promise<T | undefined>
}
export async function put(s: Store, v: unknown) {
  const db = await open()
  return p(db.transaction(s, 'readwrite').objectStore(s).put(v))
}
export async function del(s: Store, id: string) {
  const db = await open()
  return p(db.transaction(s, 'readwrite').objectStore(s).delete(id))
}
export async function delDoc(docId: string) {
  for (const s of ['versions', 'assets', 'comments'] as const) for (const x of await byDoc<{ id: string }>(s, docId)) await del(s, x.id)
  await del('handles', docId).catch(() => {})
  await del('docs', docId)
}
