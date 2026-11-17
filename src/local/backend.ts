/* Versione senza server: risponde alle stesse chiamate dell'API del tool con server (backend/app/main.py),
   ma lavora sull'archivio del browser. Così l'interfaccia è la stessa nelle due versioni. */
import type { Comment, Doc, DocFull, DocRow, Fmt, Me, User, VersionRow } from '../types'
import * as db from './db'
import { importDocx } from './docx'
import { loadDocAssets, loadLibrary, saveAsset } from './images'

export interface LocalDoc { id: string; title: string; format: Fmt; created_at: number; updated_at: number; head: number; author: string; source_name?: string }
export interface LocalVersion { id: string; docId: string; number: number; data: Doc; author: string; message: string; created_at: number }
export interface LocalComment { id: string; docId: string; version: number; block_id: string | null; page: null; author: string; body: string; parent_id: string | null; resolved: boolean; created_at: number; updated_at?: number; mentions: string[] }

const now = () => Date.now() / 1000
const uid = () => crypto.randomUUID().replace(/-/g, '')
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }

/* ---- chi sta usando il tool (solo un nome, nessun accesso) e le persone del team per le @menzioni */
export const myName = () => localStorage.getItem('imp-nome') || ''
export const setMyName = (n: string) => { localStorage.setItem('imp-nome', n.trim()); addTeam([n]) }
export const team = (): string[] => { try { return JSON.parse(localStorage.getItem('imp-team') || '[]') } catch { return [] } }
export function addTeam(names: string[]) {
  const t = new Set(team())
  for (const n of names) if (n?.trim()) t.add(n.trim())
  localStorage.setItem('imp-team', JSON.stringify([...t].sort((a, b) => a.localeCompare(b, 'it'))))
}
export function removeTeam(name: string) { localStorage.setItem('imp-team', JSON.stringify(team().filter(n => n !== name))) }
const asUser = (n: string): User => ({ id: n, name: n, email: '', is_admin: true })

async function newVersion(docId: string, data: Doc, message: string): Promise<number> {
  const d = await db.get<LocalDoc>('docs', docId)
  if (!d) throw new HttpError(404, 'Documento non trovato')
  const n = d.head + 1
  await db.put('versions', { id: uid(), docId, number: n, data, author: myName(), message, created_at: now() } satisfies LocalVersion)
  await db.put('docs', { ...d, head: n, updated_at: now(), title: data.meta.title || data.cover.title || d.title, format: data.meta.format })
  return n
}
async function headData(docId: string): Promise<Doc> {
  const vs = await db.byDoc<LocalVersion>('versions', docId)
  return vs.sort((a, b) => b.number - a.number)[0]!.data
}
const row = async (d: LocalDoc): Promise<DocRow> => ({
  ...d, role: 'proprietario',
  open_comments: (await db.byDoc<LocalComment>('comments', d.id)).filter(c => !c.parent_id && !c.resolved).length,
})
const pub = (c: LocalComment): Comment => ({ ...c, document_id: c.docId, author_id: c.author, page: null })

export async function handle(method: string, url: string, body?: unknown): Promise<unknown> {
  const path = url.split('?')[0]!
  const m = (re: RegExp) => path.match(re)
  let x: RegExpMatchArray | null

  if (path === '/me') {
    if (!myName()) throw new HttpError(401, 'Serve il nome')
    return { id: myName(), name: myName(), email: '', is_admin: true, ai: false, mail: false, formats: { a4v: 'A4 verticale', a4o: 'A4 orizzontale' } } satisfies Me
  }
  if (path === '/users') return team().map(asUser)
  if (path === '/notifications') return []
  if (path === '/library') return loadLibrary()

  if (path === '/documents' && method === 'GET') {
    const docs = await db.all<LocalDoc>('docs')
    return Promise.all(docs.sort((a, b) => b.updated_at - a.updated_at).map(row))
  }
  if (path === '/documents' && method === 'POST') {
    const f = body as FormData
    const file = f.get('file') as File
    if (!file?.name.toLowerCase().endsWith('.docx')) throw new HttpError(400, 'Carica un file Word .docx')
    const id = uid()
    const format = (f.get('format') as Fmt) || 'a4v'
    const title = String(f.get('title') || '')
    await db.put('docs', { id, title: title || 'Documento', format, created_at: now(), updated_at: now(), head: 0, author: myName(), source_name: file.name } satisfies LocalDoc)
    try {
      const { doc, report } = await importDocx(file, async (b, name) => (await saveAsset(id, b, name, 'word')).id)
      doc.meta.format = format
      doc.meta.title = title || doc.meta.title || file.name.replace(/\.docx$/i, '')
      if (title) doc.cover.title = doc.cover.title || title
      await newVersion(id, doc, `Importato da ${file.name}`)
      return { id, report }
    } catch (e) {
      await db.delDoc(id)
      throw new HttpError(400, `Non riesco a leggere il Word: ${(e as Error).message}`)
    }
  }
  if ((x = m(/^\/documents\/([\w-]+)$/))) {
    const id = x[1]!
    const d = await db.get<LocalDoc>('docs', id)
    if (!d) throw new HttpError(404, 'Documento non trovato')
    if (method === 'DELETE') { await db.delDoc(id); return { ok: true } }
    await loadDocAssets(id)
    return { ...(await row(d)), data: await headData(id), members: [] } satisfies DocFull
  }
  if ((x = m(/^\/documents\/([\w-]+)\/duplicate$/))) {
    const src = await db.get<LocalDoc>('docs', x[1]!)
    if (!src) throw new HttpError(404, 'Documento non trovato')
    const b = body as { title?: string; format?: Fmt }
    const data = await headData(src.id)
    const id = uid()
    data.meta.format = b.format || data.meta.format
    data.meta.title = b.title || `${src.title} (copia)`
    await db.put('docs', { ...src, id, title: data.meta.title, format: data.meta.format, head: 0, created_at: now(), updated_at: now(), author: myName() })
    // le immagini si copiano con un id nuovo e si aggiornano i riferimenti nel documento
    const assets = await db.byDoc<{ id: string }>('assets', src.id)
    let fixed = JSON.stringify(data)
    for (const a of assets) {
      const nidA = `${a.id}-${id.slice(0, 6)}`
      await db.put('assets', { ...a, id: nidA, docId: id })
      fixed = fixed.split(`"${a.id}"`).join(`"${nidA}"`)
    }
    await newVersion(id, JSON.parse(fixed), `Copia di «${src.title}»`)
    return { id }
  }
  if ((x = m(/^\/documents\/([\w-]+)\/versions$/))) {
    const id = x[1]!
    if (method === 'GET') {
      const vs = await db.byDoc<LocalVersion>('versions', id)
      return vs.sort((a, b) => b.number - a.number).map(v => ({ number: v.number, message: v.message, created_at: v.created_at, author: v.author }) satisfies VersionRow)
    }
    const b = body as { data: Doc; message?: string; base?: number | null }
    const d = await db.get<LocalDoc>('docs', id)
    if (!d) throw new HttpError(404, 'Documento non trovato')
    if (b.base != null && b.base !== d.head) throw Object.assign(new HttpError(409, 'conflitto'), { body: { conflict: true, head: d.head } })
    const n = await newVersion(id, b.data, (b.message || '').trim().slice(0, 300))
    return { number: n, data: b.data }
  }
  if ((x = m(/^\/documents\/([\w-]+)\/versions\/(\d+)(\/restore)?$/))) {
    const [, id, num, restore] = x
    const v = (await db.byDoc<LocalVersion>('versions', id!)).find(v => v.number === Number(num))
    if (!v) throw new HttpError(404, 'Versione non trovata')
    if (restore) return { number: await newVersion(id!, v.data, `Ripristinata la versione ${num}`) }
    return { ...v, data: v.data }
  }
  if ((x = m(/^\/documents\/([\w-]+)\/assets$/))) {
    const id = x[1]!
    if (method === 'GET') return (await loadDocAssets(id)).map(({ blob, ...a }) => a)
    const f = body as FormData
    const file = f.get('file') as File
    if (file.size > 60 * 1024 * 1024) throw new HttpError(400, 'Immagine troppo grande (massimo 60 MB)')
    const { blob, ...a } = await saveAsset(id, file, file.name.replace(/\.[^.]+$/, ''), 'caricata', (f.get('kind') as 'foto') || 'foto')
    return a
  }
  if ((x = m(/^\/documents\/([\w-]+)\/comments$/))) {
    const id = x[1]!
    if (method === 'GET') return (await db.byDoc<LocalComment>('comments', id)).sort((a, b) => a.created_at - b.created_at).map(pub)
    const b = body as { body: string; block_id: string | null; parent_id?: string; mentions?: string[] }
    if (!b.body?.trim()) throw new HttpError(400, 'Il commento è vuoto')
    const d = await db.get<LocalDoc>('docs', id)
    const c: LocalComment = { id: uid(), docId: id, version: d?.head ?? 0, block_id: b.block_id ?? null, page: null, author: myName(), body: b.body.trim().slice(0, 5000), parent_id: b.parent_id ?? null, resolved: false, created_at: now(), mentions: b.mentions ?? [] }
    await db.put('comments', c)
    return pub(c)
  }
  if ((x = m(/^\/comments\/([\w:-]+)$/))) {
    const c = await db.get<LocalComment>('comments', x[1]!)
    if (!c) throw new HttpError(404, 'Commento non trovato')
    if (method === 'DELETE') {
      for (const r of await db.byDoc<LocalComment>('comments', c.docId)) if (r.parent_id === c.id) await db.del('comments', r.id)
      await db.del('comments', c.id)
      return { ok: true }
    }
    const b = body as { resolved?: boolean; body?: string }
    await db.put('comments', { ...c, ...(b.resolved !== undefined ? { resolved: b.resolved } : {}), ...(b.body ? { body: b.body } : {}), updated_at: now() })
    return { ok: true }
  }
  throw new HttpError(404, `Funzione non disponibile nella versione senza server (${method} ${path})`)
}
