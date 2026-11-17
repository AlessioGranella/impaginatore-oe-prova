/* File .oe: tutto il documento in un file (versioni, commenti, immagini) da tenere nella cartella condivisa
   del team (Drive, OneDrive, SharePoint sincronizzati). Su Chrome/Edge il tool può collegarsi al file e
   riscriverlo da solo a ogni «Salva versione». */
import * as db from './db'
import { registerAsset, type StoredAsset } from './images'
import type { LocalComment, LocalDoc, LocalVersion } from './backend'

export interface OeFile {
  type: 'impaginatore-oe'; v: 1; saved_at: number; saved_by: string
  doc: LocalDoc; versions: LocalVersion[]; comments: LocalComment[]; team: string[]
  assets: (Omit<StoredAsset, 'blob'> & { mime: string; data: string })[]
}

const b64 = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob) })
const unb64 = (s: string, mime: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }) }

export async function buildFile(docId: string, me: string, team: string[]): Promise<Blob> {
  const doc = await db.get<LocalDoc>('docs', docId)
  if (!doc) throw new Error('Documento non trovato')
  const assets = await db.byDoc<StoredAsset>('assets', docId)
  const f: OeFile = {
    type: 'impaginatore-oe', v: 1, saved_at: Date.now() / 1000, saved_by: me,
    doc, versions: await db.byDoc<LocalVersion>('versions', docId), comments: await db.byDoc<LocalComment>('comments', docId), team,
    assets: await Promise.all(assets.map(async ({ blob, ...a }) => ({ ...a, mime: blob.type || 'image/jpeg', data: await b64(blob) }))),
  }
  return new Blob([JSON.stringify(f)], { type: 'application/json' })
}

export const fileName = (title: string) => `${title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'documento'}.oe`

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export type ImportResult = { id: string; outcome: 'nuovo' | 'aggiornato' | 'gia-aggiornato' | 'copia'; title: string; team: string[] }

/** Apre un file .oe. Se il documento c'è già: aggiorna se il file contiene tutto quello che hai, altrimenti crea una copia. */
export async function importFile(file: Blob): Promise<ImportResult> {
  let f: OeFile
  try { f = JSON.parse(await file.text()) } catch { throw new Error('Il file non è un documento dell\'impaginatore (.oe)') }
  if (f?.type !== 'impaginatore-oe') throw new Error('Il file non è un documento dell\'impaginatore (.oe)')
  const local = await db.get<LocalDoc>('docs', f.doc.id)
  let outcome: ImportResult['outcome'] = 'nuovo'
  let id = f.doc.id
  if (local) {
    const mine = await db.byDoc<LocalVersion>('versions', id)
    const theirs = new Set(f.versions.map(v => v.id))
    const mineSet = new Set(mine.map(v => v.id))
    const fileHasAll = mine.every(v => theirs.has(v.id))
    const iHaveAll = f.versions.every(v => mineSet.has(v.id))
    if (iHaveAll) outcome = 'gia-aggiornato'          // il file non ha versioni nuove: si uniscono solo i commenti
    else if (fileHasAll) outcome = 'aggiornato'       // il file contiene tutto il mio e qualcosa in più
    else outcome = 'copia'                            // abbiamo salvato in due: niente sovrascritture
  }
  if (outcome === 'copia') {
    // le versioni divergono: il file entra come documento a parte, nessuno perde lavoro
    id = crypto.randomUUID().replace(/-/g, '')
    f.doc = { ...f.doc, id, title: `${f.doc.title} (dal file ${new Date(f.saved_at * 1000).toLocaleDateString('it-IT')})` }
    f.versions = f.versions.map(v => ({ ...v, id: `${id}:${v.number}:${v.id}`, docId: id }))
    f.comments = f.comments.map(c => ({ ...c, id: `${id}:${c.id}`, docId: id, parent_id: c.parent_id ? `${id}:${c.parent_id}` : null }))
  }
  {
    // anche se le versioni sono già tutte qui, si uniscono commenti e immagini nuove
    if (outcome !== 'gia-aggiornato') {
      await db.put('docs', { ...f.doc, id })
      for (const v of f.versions) await db.put('versions', { ...v, docId: id })
    }
    // commenti: unione (quelli nuovi del file si aggiungono, lo stato «risolto» più recente vince)
    for (const c of f.comments) {
      const mine = await db.get<LocalComment>('comments', c.id)
      if (!mine || (c.updated_at ?? c.created_at) >= (mine.updated_at ?? mine.created_at)) await db.put('comments', { ...c, docId: id })
    }
    for (const a of f.assets) {
      if (await db.get('assets', a.id)) continue
      const { data, mime, ...rest } = a
      const st: StoredAsset = { ...rest, docId: id, blob: unb64(data, mime) }
      await db.put('assets', st)
      registerAsset(st)
    }
  }
  return { id, outcome, title: f.doc.title, team: f.team || [] }
}

/* ---- collegamento a un file nella cartella condivisa (Chrome/Edge) */
type Handle = FileSystemFileHandle & { queryPermission?: (o: object) => Promise<string>; requestPermission?: (o: object) => Promise<string> }
export const canLink = () => typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'

export async function linkFile(docId: string, title: string): Promise<string> {
  const h = await (window as unknown as { showSaveFilePicker: (o: object) => Promise<Handle> }).showSaveFilePicker({
    suggestedName: fileName(title), types: [{ description: 'Documento impaginatore', accept: { 'application/json': ['.oe'] } }],
  })
  await db.put('handles', { docId, handle: h, name: h.name })
  return h.name
}
export async function linkedName(docId: string): Promise<string | null> {
  const h = await db.get<{ name: string }>('handles', docId)
  return h?.name ?? null
}
export async function unlink(docId: string) { await db.del('handles', docId) }

/** Riscrive il file collegato. Ritorna false se non c'è un file collegato o manca il permesso. */
export async function writeLinked(docId: string, me: string, team: string[]): Promise<boolean> {
  const rec = await db.get<{ handle: Handle }>('handles', docId)
  if (!rec) return false
  const h = rec.handle
  const opt = { mode: 'readwrite' }
  if (h.queryPermission && (await h.queryPermission(opt)) !== 'granted') {
    if (!h.requestPermission || (await h.requestPermission(opt)) !== 'granted') return false
  }
  const w = await h.createWritable()
  await w.write(await buildFile(docId, me, team))
  await w.close()
  return true
}
