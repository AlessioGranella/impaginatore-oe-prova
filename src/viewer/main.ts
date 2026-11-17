/* Visualizzatore delle pagine (dentro un iframe, così gli stili del documento e quelli dell'app non si mescolano).
   Impagina con Vivliostyle, gestisce clic, selezione, segnaposto dei commenti, avvisi e stampa in PDF.
   L'editor lo comanda con window.imp (stessa origine). */
import { CoreViewer, ReadyState } from '@vivliostyle/core'

export interface SectionInfo { id: string; title: string; blocks: string[]; tight: number }
export interface Warn { section: string; title: string; page: number; fill: number; tight: number }
export interface Pin { blockId: string; count: number; threadId: string }
export interface ViewerApi {
  render(html: string, opts: { sections: SectionInfo[]; contentTop: number; contentH: number; spread: boolean; keepScroll: boolean }): Promise<{ pages: number; warnings: Warn[]; ms: number }>
  select(id: string | null, scroll: boolean): void
  pins(p: Pin[]): void
  print(): void
  onPick?: (id: string) => void
  onPin?: (threadId: string) => void
}

const vp = document.getElementById('vp')!
const viewer = new CoreViewer({ viewportElement: vp, window }, { renderAllPages: true, autoResize: true, pageViewMode: 'singlePage' as never, fitToScreen: false, zoom: 1 })
let readyResolve: (() => void) | null = null
let errors: string[] = []
viewer.addListener('readystatechange', () => { if (viewer.readyState === ReadyState.COMPLETE) readyResolve?.() })
viewer.addListener('error', e => { errors.push(String((e as { content?: { message?: string } }).content?.message ?? 'errore')) })

let lastUrl = ''
let selId: string | null = null
let pinList: Pin[] = []
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
    // punto di riferimento per non perdere il segno: il blocco selezionato, altrimenti la prima pagina in vista
    const anchor = findAnchor()
    errors = []
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const done = new Promise<void>(r => { readyResolve = r })
    viewer.loadDocument({ url })
    await done
    await settle()
    if (lastUrl) URL.revokeObjectURL(lastUrl)
    lastUrl = url
    layoutPages(opts.spread)
    decorate()
    if (opts.keepScroll && anchor) restoreAnchor(anchor)
    if (errors.length) console.warn('vivliostyle', errors)
    return { pages: pages().length, warnings: warnings(opts.sections, opts.contentTop, opts.contentH), ms: Math.round(performance.now() - t0) }
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

type Anchor = { bid: string | null; page: number; y: number }
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

/* ---- selezione e segnaposto dei commenti dopo ogni impaginazione */
function decorate() {
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
  const t = (e.target as Element).closest?.('[data-bid]') as HTMLElement | null
  if (t && t.closest('[data-vivliostyle-page-container]')) { e.preventDefault(); api.onPick?.(t.dataset.bid!) }
})

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
