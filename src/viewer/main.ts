/* Visualizzatore delle pagine (dentro un iframe, così gli stili del documento e quelli dell'app non si mescolano).
   Impagina con Vivliostyle, gestisce clic, selezione, segnaposto dei commenti, avvisi e stampa in PDF.
   L'editor lo comanda con window.imp (stessa origine). */
import { CoreViewer, ReadyState } from '@vivliostyle/core'

export interface SectionInfo { id: string; title: string; blocks: string[]; tight: number }
export interface Warn { section: string; title: string; page: number; fill: number; tight: number; kind?: 'vuota' | 'lunga' }
export interface Pin { blockId: string; count: number; threadId: string }
export interface Mark { threadId: string; blockId: string; quote: string }
export interface Anchor { bid: string | null; page: number; y: number }
export interface TextSel { bid: string; quote: string; x: number; y: number; w: number; h: number }
export interface ViewerApi {
  render(html: string, opts: { sections: SectionInfo[]; contentTop: number; contentH: number; spread: boolean; anchor: Anchor | null; overflow?: boolean }): Promise<{ pages: number; warnings: Warn[]; ms: number }>
  select(id: string | null, scroll: boolean): void
  pins(p: Pin[]): void
  marks(m: Mark[]): void
  /** testo nuovo di un blocco, scritto subito nella pagina (senza reimpaginare): false se il blocco è spezzato o assente */
  patch(bid: string, html: string): boolean
  anchor(): Anchor | null
  restore(a: Anchor | null): void
  print(): void
  onPick?: (id: string) => void
  onPin?: (threadId: string) => void
  onTextSel?: (s: TextSel | null) => void
}

const vp = document.getElementById('vp')!
const viewer = new CoreViewer({ viewportElement: vp, window }, { renderAllPages: true, autoResize: false, pageViewMode: 'singlePage' as never, fitToScreen: false, zoom: 1 })
let readyResolve: (() => void) | null = null
let errors: string[] = []
viewer.addListener('readystatechange', () => { if (viewer.readyState === ReadyState.COMPLETE) readyResolve?.() })
viewer.addListener('error', e => { errors.push(String((e as { content?: { message?: string } }).content?.message ?? 'errore')) })

let lastUrl = ''
let selId: string | null = null
let pinList: Pin[] = []
let markList: Mark[] = []
let markRanges: { range: Range; threadId: string }[] = []
const pages = () => Array.from(document.querySelectorAll<HTMLElement>('[data-vivliostyle-page-container]'))

/** Dispone le pagine in colonna (o due per riga) e adatta l'ingrandimento alla larghezza.
    Le pagine stanno in una griglia CSS dentro il contenitore di Vivliostyle. */
let spreadMode = false
function layoutPages(spread: boolean) {
  spreadMode = spread
  const box = document.querySelector<HTMLElement>('[data-vivliostyle-outer-zoom-box]')
  const sc = document.querySelector<HTMLElement>('[data-vivliostyle-spread-container]')
  const ps = pages()
  if (!box || !sc || !ps.length) return
  vp.style.zoom = '1'
  // misure misurate sul campo: la griglia lavora nelle stesse unità di offsetWidth delle pagine
  const pw = ps[0]!.offsetWidth, ph = ps[0]!.offsetHeight, gap = 24
  const cols = spread ? 2 : 1
  const rows = Math.ceil(ps.length / cols)
  const set = (el: HTMLElement, p: string, v: string) => el.style.setProperty(p, v, 'important')
  set(sc, 'transform-origin', '0 0')
  set(sc, 'width', `${cols * pw + (cols - 1) * gap}px`)
  set(sc, 'height', 'auto')
  set(sc, 'grid-template-columns', `repeat(${cols}, ${pw}px)`)
  set(sc, 'gap', `${gap}px`)
  const W = cols * pw + (cols - 1) * gap, H = rows * ph + (rows - 1) * gap
  set(box, 'width', `${W}px`)
  set(box, 'height', `${H}px`)
  const avail = window.innerWidth - 48
  const z = Math.min(1.6, Math.max(0.2, (spread ? avail : Math.min(avail, 900)) / W))
  vp.style.zoom = String(z)
}
const fitZoom = layoutPages

/** Disposizione per la stampa: si tolgono griglia, spazi e ingrandimento (restano le regole di Vivliostyle). */
function printLayout() {
  const box = document.querySelector<HTMLElement>('[data-vivliostyle-outer-zoom-box]')
  const sc = document.querySelector<HTMLElement>('[data-vivliostyle-spread-container]')
  vp.style.zoom = '1'
  for (const p of ['gap', 'grid-template-columns', 'width', 'height']) sc?.style.removeProperty(p)
  for (const p of ['width', 'height']) box?.style.removeProperty(p)
  document.body.classList.add('printing')
}
window.addEventListener('afterprint', () => document.body.classList.remove('printing'))
window.addEventListener('resize', () => layoutPages(spreadMode))

const api: ViewerApi = {
  async render(html, opts) {
    const t0 = performance.now()
    errors = []
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const done = new Promise<void>(r => { readyResolve = r })
    // l'impaginazione si fa sempre a ingrandimento 1: Vivliostyle misura le colonne delle tabelle divise tra
    // due pagine sullo schermo, e con lo zoom dell'anteprima le scriverebbe più larghe della pagina
    vp.style.zoom = '1'
    viewer.loadDocument({ url })
    await done
    await settle()
    if (lastUrl) URL.revokeObjectURL(lastUrl)
    lastUrl = url
    layoutPages(opts.spread)
    decorate()
    if (opts.anchor) restoreAnchor(opts.anchor)
    if (errors.length) console.warn('vivliostyle', errors)
    return { pages: pages().length, warnings: opts.overflow ? overflowWarnings(opts.sections) : warnings(opts.sections, opts.contentTop, opts.contentH), ms: Math.round(performance.now() - t0) }
  },
  select(id, scroll) {
    selId = id
    document.querySelectorAll('.imp-sel').forEach(e => e.classList.remove('imp-sel'))
    if (!id) return
    const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-vivliostyle-page-container] [data-bid="${CSS.escape(id)}"]`))
    els.forEach(e => e.classList.add('imp-sel'))
    if (scroll && els[0]) {
      const r = els[0].getBoundingClientRect()
      if (r.top < 40 || r.top > window.innerHeight - 80) els[0].scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  },
  pins(p) { pinList = p; decorate() },
  marks(m) { markList = m; paintMarks() },
  patch(bid, html) {
    const els = document.querySelectorAll<HTMLElement>(`[data-vivliostyle-page-container] [data-bid="${CSS.escape(bid)}"]`)
    if (els.length !== 1) return false
    const el = els[0]!
    if (!/^(P|H4|BLOCKQUOTE|DIV)$/.test(el.tagName) || el.querySelector('[data-bid], img, table')) return false
    el.innerHTML = html
    paintMarks()
    return true
  },
  anchor: () => findAnchor(),
  restore: a => { if (a) restoreAnchor(a) },
  print() {
    // in stampa: una pagina per foglio, a grandezza reale, senza spazi tra le pagine
    printLayout()
    document.querySelectorAll('.imp-sel, .imp-hover').forEach(e => e.classList.remove('imp-sel', 'imp-hover'))
    const back = () => { window.removeEventListener('afterprint', back); layoutPages(spreadMode); decorate() }
    window.addEventListener('afterprint', back)
    setTimeout(() => window.print(), 300)
  },
}
;(window as unknown as { imp: ViewerApi }).imp = api

/** Aspetta che Vivliostyle abbia finito di riempire le pagine (il numero di pagine resta fermo). */
async function settle() {
  let n = -1
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 60))
    const m = pages().length
    if (m === n && m > 0) return
    n = m
  }
}

function findAnchor(): Anchor | null {
  const sel = selId ? document.querySelector<HTMLElement>(`[data-vivliostyle-page-container] [data-bid="${CSS.escape(selId)}"]`) : null
  if (sel) { const r = sel.getBoundingClientRect(); if (r.bottom > 0 && r.top < window.innerHeight) return { bid: selId, page: -1, y: r.top } }
  const ps = pages()
  const i = ps.findIndex(p => p.getBoundingClientRect().bottom > 0)
  return i >= 0 ? { bid: null, page: i, y: ps[i]!.getBoundingClientRect().top } : null
}
function restoreAnchor(a: Anchor) {
  const el = a.bid ? document.querySelector<HTMLElement>(`[data-vivliostyle-page-container] [data-bid="${CSS.escape(a.bid)}"]`) : pages()[Math.min(a.page, pages().length - 1)]
  if (!el) return
  window.scrollBy(0, el.getBoundingClientRect().top - a.y)
}

/* ---- passaggi di testo commentati: evidenziati con la Highlight API (non si tocca il testo della pagina) */
function textRange(root: HTMLElement, quote: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: { n: Text; start: number }[] = []
  let all = ''
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) { nodes.push({ n, start: all.length }); all += n.data }
  const norm = (s: string) => s.replace(/\s+/g, ' ')
  // confronto con gli spazi normalizzati: si costruisce una mappa posizione-normalizzata -> posizione reale
  const map: number[] = []
  let flat = ''
  for (let i = 0; i < all.length; i++) {
    const ch = /\s/.test(all[i]!) ? ' ' : all[i]!
    if (ch === ' ' && flat.endsWith(' ')) continue
    flat += ch; map.push(i)
  }
  const q = norm(quote).trim()
  const at = flat.indexOf(q)
  if (at < 0 || !q) return null
  const s = map[at]!, e = map[at + q.length - 1]! + 1
  const pos = (k: number) => { const x = nodes.filter(o => o.start <= k).pop()!; return { node: x.n, off: Math.min(k - x.start, x.n.data.length) } }
  const a = pos(s), b = pos(e - 1)
  const r = document.createRange()
  r.setStart(a.node, a.off); r.setEnd(b.node, b.off + 1)
  return r
}
function paintMarks() {
  markRanges = []
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  for (const m of markList) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-vivliostyle-page-container] [data-bid="${CSS.escape(m.blockId)}"]`))) {
      const r = textRange(el, m.quote)
      if (r) { markRanges.push({ range: r, threadId: m.threadId }); break }
    }
  }
  if (H && reg) reg.set('imp-cm', new H(...markRanges.map(x => x.range)))
}
function markAt(x: number, y: number): string | null {
  const d = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  let node: Node | null = null, off = 0
  const cp = d.caretPositionFromPoint?.(x, y)
  if (cp) { node = cp.offsetNode; off = cp.offset } else { const cr = d.caretRangeFromPoint?.(x, y); if (cr) { node = cr.startContainer; off = cr.startOffset } }
  if (!node) return null
  for (const m of markRanges) { try { if (m.range.isPointInRange(node, off)) return m.threadId } catch { /* nodo di un altro documento */ } }
  return null
}

/* ---- selezione e segnaposto dei commenti dopo ogni impaginazione */
function decorate() {
  paintMarks()
  document.querySelectorAll('.imp-pin').forEach(e => e.remove())
  if (selId) api.select(selId, false)
  for (const pin of pinList) {
    const el = document.querySelector<HTMLElement>(`[data-vivliostyle-page-container] [data-bid="${CSS.escape(pin.blockId)}"]`)
    const page = el?.closest<HTMLElement>('[data-vivliostyle-page-container]')
    if (!el || !page) continue
    const pr = page.getBoundingClientRect(), er = el.getBoundingClientRect()
    const scale = pr.width / page.offsetWidth || 1
    const b = document.createElement('button')
    b.className = 'imp-pin'
    b.textContent = String(pin.count)
    b.title = `${pin.count} commenti aperti`
    b.style.left = `${Math.min(er.right - pr.left, pr.width - 30) / scale + 6}px`
    b.style.top = `${(er.top - pr.top) / scale}px`
    b.onclick = e => { e.stopPropagation(); api.onPin?.(pin.threadId) }
    page.appendChild(b)
  }
}

/* ---- clic e passaggio del mouse: il blocco più interno con data-bid */
let hover: Element | null = null
document.addEventListener('mouseover', e => {
  const t = (e.target as Element).closest?.('[data-vivliostyle-page-container] [data-bid]')
  if (t === hover) return
  hover?.classList.remove('imp-hover')
  hover = t
  hover?.classList.add('imp-hover')
})
document.addEventListener('click', e => {
  const s = document.getSelection()
  if (s && !s.isCollapsed && s.toString().trim()) return // si sta selezionando una frase: niente clic sul blocco
  const th = markAt(e.clientX, e.clientY)
  if (th) { e.preventDefault(); api.onPin?.(th); return }
  const t = (e.target as Element).closest?.('[data-bid]') as HTMLElement | null
  if (t && t.closest('[data-vivliostyle-page-container]')) { e.preventDefault(); api.onPick?.(t.dataset.bid!) }
})

/* ---- frase selezionata nella pagina: la si passa all'editor per commentarla (come in Acrobat) o chiedere una modifica */
document.addEventListener('mouseup', () => setTimeout(() => {
  const s = document.getSelection()
  const q = s && !s.isCollapsed ? s.toString().replace(/\s+/g, ' ').trim() : ''
  if (!s || !q || q.length < 2) { api.onTextSel?.(null); return }
  const r = s.getRangeAt(0)
  const start = (r.startContainer.nodeType === 1 ? r.startContainer as Element : r.startContainer.parentElement)?.closest<HTMLElement>('[data-vivliostyle-page-container] [data-bid]')
  if (!start) { api.onTextSel?.(null); return }
  const rects = Array.from(r.getClientRects()).filter(x => x.width > 0)
  const top = rects[0] ?? r.getBoundingClientRect()
  api.onTextSel?.({ bid: start.dataset.bid!, quote: q.slice(0, 400), x: top.left, y: top.top, w: top.width, h: top.height })
}, 0))
document.addEventListener('mousedown', e => { if (!(e.target as Element).closest?.('.imp-pin')) api.onTextSel?.(null) })
window.addEventListener('scroll', () => { const s = document.getSelection(); if (s && !s.isCollapsed) api.onTextSel?.(null) }, { passive: true })

/* ---- brochure: ogni sezione è una pagina; avviso se il contenuto non ci sta e continua sulla pagina dopo */
function overflowWarnings(sections: SectionInfo[]): Warn[] {
  const ps = pages()
  const out: Warn[] = []
  document.querySelectorAll('.imp-over').forEach(e => e.classList.remove('imp-over'))
  for (const s of sections) {
    const i = ps.findIndex(p => p.querySelector(`.pg[data-bid="${CSS.escape(s.id)}"]`))
    const box = i >= 0 ? ps[i]!.querySelector<HTMLElement>(`.pg[data-bid="${CSS.escape(s.id)}"] .pgc`) : null
    if (!box) continue
    // il riquadro della pagina taglia ciò che non ci sta: quanto testo resta fuori, in proporzione
    // ciò che esce in basso (testo) o a destra (numeri in fila), in proporzione
    const extra = Math.max(box.scrollHeight - box.clientHeight, (box.scrollWidth - box.clientWidth) * box.clientHeight / box.clientWidth)
    if (extra > 2) { box.classList.add('imp-over'); out.push({ section: s.id, title: s.title, page: i + 1, fill: 1 + extra / box.clientHeight, tight: s.tight, kind: 'lunga' }) }
  }
  return out
}

/* ---- avvisi: sezioni che finiscono con poche righe da sole su una pagina */
function warnings(sections: SectionInfo[], contentTop: number, contentH: number): Warn[] {
  const ps = pages()
  const byPage = ps.map(p => new Set(Array.from(p.querySelectorAll<HTMLElement>('[data-bid]')).map(e => e.dataset.bid!)))
  const out: Warn[] = []
  for (const s of sections) {
    const idx = byPage.map((set, i) => (set.has(s.id) ? i : -1)).filter(i => i >= 0)
    if (idx.length < 2) continue
    const last = idx[idx.length - 1]!
    const blocks = new Set(s.blocks)
    const others = [...byPage[last]!].filter(b => b !== s.id && !blocks.has(b))
    if (others.length) continue
    const page = ps[last]!
    const pr = page.getBoundingClientRect()
    let bottom = 0
    page.querySelectorAll<HTMLElement>('[data-bid]').forEach(e => { if (blocks.has(e.dataset.bid!)) bottom = Math.max(bottom, e.getBoundingClientRect().bottom) })
    if (!bottom) continue
    const fill = ((bottom - pr.top) / pr.height - contentTop) / contentH
    if (fill < 0.3) out.push({ section: s.id, title: s.title, page: last + 1, fill: Math.max(0, Math.round(fill * 100) / 100), tight: s.tight })
  }
  return out
}
