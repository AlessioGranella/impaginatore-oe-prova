/* Immagini nel browser: archivio (icone e pixel art del DS) + immagini del documento (in IndexedDB).
   Il ritaglio sul punto di interesse si fa con un canvas, con lo stesso calcolo del motore Python. */
import type { Asset, Doc, ImageRef } from '../types'
import * as db from './db'

export interface StoredAsset extends Asset { docId: string; blob: Blob; created_at: number }

const BASE = import.meta.env.BASE_URL
const urls = new Map<string, string>()          // id -> URL (file statico o blob:)
let library: (Asset & { path: string })[] | null = null

export async function loadLibrary(): Promise<Asset[]> {
  if (!library) {
    library = await (await fetch(`${BASE}library/index.json`)).json() as (Asset & { path: string })[]
    for (const a of library) urls.set(a.id, new URL(BASE + a.path, location.href).href)
  }
  return library
}

/** Carica in memoria le immagini di un documento (per avere URL immediati). */
export async function loadDocAssets(docId: string): Promise<StoredAsset[]> {
  await loadLibrary()
  const list = await db.byDoc<StoredAsset>('assets', docId)
  for (const a of list) if (!urls.has(a.id)) urls.set(a.id, URL.createObjectURL(a.blob))
  return list.sort((a, b) => b.created_at - a.created_at)
}
export function registerAsset(a: StoredAsset) { if (!urls.has(a.id)) urls.set(a.id, URL.createObjectURL(a.blob)) }
export const assetUrl = (id: string) => urls.get(id) ?? ''

export async function saveAsset(docId: string, blob: Blob, name: string, source: string, kind: Asset['kind'] = 'foto'): Promise<StoredAsset> {
  let width: number | undefined, height: number | undefined
  if (!blob.type.includes('svg')) {
    try { const bm = await createImageBitmap(blob); width = bm.width; height = bm.height; bm.close() } catch { throw new Error('Il file non è un\'immagine leggibile') }
  }
  const a: StoredAsset = { id: crypto.randomUUID().replace(/-/g, ''), docId, kind, source, name, blob, width, height, created_at: Date.now() / 1000 }
  await db.put('assets', a)
  registerAsset(a)
  return a
}

export const imageKey = (ref: ImageRef, w: number, h: number) => `${ref.asset}|${w.toFixed(1)}|${h.toFixed(1)}|${ref.cx}|${ref.cy}|${ref.zoom}`

/* ---- ritaglio con cache (chiave = immagine + misura + punto + zoom + risoluzione) */
const cache = new Map<string, Promise<string>>()
const bitmaps = new Map<string, Promise<ImageBitmap>>()

function bitmap(id: string) {
  let b = bitmaps.get(id)
  if (!b) { b = fetch(assetUrl(id)).then(r => r.blob()).then(createImageBitmap); bitmaps.set(id, b) }
  return b
}

async function crop(ref: ImageRef, wmm: number, hmm: number, ppi: number): Promise<string> {
  const im = await bitmap(ref.asset)
  const W = im.width, H = im.height, ar = wmm / hmm
  let cw: number, ch: number
  if (W / H > ar) { cw = H * ar; ch = H } else { cw = W; ch = W / ar }
  const z = Math.min(Math.max(ref.zoom || 1, 0.2), 1)
  cw *= z; ch *= z
  const x = Math.min(Math.max(ref.cx * W - cw / 2, 0), W - cw)
  const y = Math.min(Math.max(ref.cy * H - ch / 2, 0), H - ch)
  const tw = Math.min(Math.round(wmm / 25.4 * ppi), Math.round(cw))
  const th = Math.max(1, Math.round(tw / ar))
  const c = new OffscreenCanvas(tw, th)
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'; g.fillRect(0, 0, tw, th)
  g.imageSmoothingQuality = 'high'
  g.drawImage(im, x, y, cw, ch, 0, 0, tw, th)
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.88 })
  return URL.createObjectURL(blob)
}

/** Prepara tutte le immagini del documento. ppi: 150 per l'anteprima, 300 per il PDF. */
export async function prepareImages(needs: { ref: ImageRef; w: number; h: number; whole?: boolean }[], ppi: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  await Promise.all(needs.map(async n => {
    const key = imageKey(n.ref, n.w, n.h)
    if (n.whole) { if (assetUrl(n.ref.asset)) out.set(key, assetUrl(n.ref.asset)); return }
    if (!assetUrl(n.ref.asset)) return
    const ck = `${key}|${ppi}`
    let pr = cache.get(ck)
    if (!pr) { pr = crop(n.ref, n.w, n.h, ppi); cache.set(ck, pr) }
    try { out.set(key, await pr) } catch { cache.delete(ck) }
  }))
  return out
}

/** Id di tutte le immagini usate (per l'esportazione nel file). */
export function usedAssets(d: Doc): Set<string> {
  const s = new Set<string>()
  const add = (r: ImageRef | null | undefined) => { if (r?.asset) s.add(r.asset) }
  add(d.cover.image)
  for (const ch of d.chapters) {
    add(ch.image)
    for (const se of ch.sections) {
      add(se.layout?.band); if (se.layout?.ornament) s.add(se.layout.ornament)
      for (const b of se.blocks) { if (b.type === 'image') add(b.image); if (b.type === 'table') for (const i of b.icons || []) if (i) s.add(i) }
    }
  }
  return s
}
