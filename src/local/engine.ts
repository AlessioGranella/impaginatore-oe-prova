/* Motore di impaginazione nel browser: documento (JSON a blocchi) -> HTML paginato con CSS Paged Media.
   È la traduzione di backend/app/render/engine.py (versione con server): stesse regole, stesso report.css.
   L'impaginazione in pagine la fa Vivliostyle (src/viewer). */
import css from './report.css?raw'
import type { Block, Doc, ImageRef, Section, TableBlock } from '../types'
import { imageKey } from './images'
import { brandOf, type BrandDef } from './brand'
import { buildBrochure, brochureNeeds } from './brochure'

export const FORMATS = {
  a4v: { label: 'A4 verticale', PW: 210, PH: 297, MT: 22, MR: 18, MB: 26, ML: 18, BAND: 118, SIDE: 44.75, SIDEW: 38.5, C1COLS: 1, C2COLS: 2, TOCC: 2, H1: 50, H2: 44, OTOP: 30, CTW: 165, OSW: 150, OSC: 1, HLCOLS: '1fr 1fr', HKH: 42, KPIMAX: 3, ELMAX: 3 },
  a4o: { label: 'A4 orizzontale', PW: 297, PH: 210, MT: 18, MR: 18, MB: 22, ML: 18, BAND: 78, SIDE: 64, SIDEW: 56, C1COLS: 2, C2COLS: 3, TOCC: 3, H1: 46, H2: 40, OTOP: 22, CTW: 200, OSW: 250, OSC: 2, HLCOLS: '1fr 1fr 1fr', HKH: 34, KPIMAX: 4, ELMAX: 4 },
} as const
type F = (typeof FORMATS)[keyof typeof FORMATS]

/** Colori del brand scritti direttamente nel CSS (var(--b700) → #4400B3): niente dipendenza dalle variabili CSS. */
export function applyBrand(css: string, b: BrandDef, base: string): string {
  let out = css
  for (const [k, v] of Object.entries(b.vars)) out = out.split(`var(${k})`).join(v)
  return out.replace(/url\(fonts\//g, `url(${base}fonts/`).replace(/url\(logos\//g, `url(${base}logos/${b.dir}`)
}

export function cssFor(fmt: 'a4v' | 'a4o', mode: 'digital' | 'print', base: string, brand: BrandDef = brandOf('oe')): string {
  const f = FORMATS[fmt]
  const bleed = mode === 'print' ? 3 : 0
  const r1 = (n: number) => Math.round(n * 10) / 10
  const vals: Record<string, string | number> = {
    ...f, PWB: f.PW + 6, PHB: f.PH + 6, FNX: f.MR + bleed, FNB: f.MB + bleed, BANDPAD: f.BAND - f.MB,
    BAND1: r1(f.BAND * 0.81), BANDPAD1: r1(f.BAND * 0.81 - f.MB), BAND2: r1(f.BAND * 0.61), BANDPAD2: r1(f.BAND * 0.61 - f.MB),
    BLEED: mode === 'print' ? 'bleed: 3mm;' : '',
  }
  return applyBrand(css.replace(/@([A-Z0-9]+)@/g, (_, k: string) => String(vals[k])), brand, base)
}

/* ------------------------------------------------------------------ testo */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
const TAGS = /(<\/?strong>|<br\s*\/?>)/
/** Testo con il solo grassetto e gli a capo; tutto il resto viene codificato (niente doppie codifiche). */
export function inline(s: string): string {
  return (s || '').split(TAGS).map(p => TAGS.test(p) ? (p.startsWith('<br') ? '<br>' : p) : esc(unesc(p))).join('')
}
export const plain = (s: string) => unesc((s || '').replace(/<\/?strong>|<br>/g, ' ')).trim()
const pad = (n: number) => String(n).padStart(2, '0')
const attr = (s: string) => esc(s).replace(/"/g, '&quot;')

export function parseNum(s: string): number | null {
  const m = (s || '').match(/-?\d[\d.]*(,\d+)?/)
  if (!m) return null
  let t = m[0]
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const v = parseFloat(t)
  return isNaN(v) ? null : v
}
const isnum = (s: string) => /^[\s\d.,%€–—\-+()]+$/.test(s || '') && /\d|^[–—-]$/.test((s || '').trim())

/* ------------------------------------------------------------------ voci brevi (card) */
const tlen = (h: string) => plain(h).length
/** Gruppi di voci brevi in fila da mostrare come card: sottotitolo + 1-2 paragrafi, oppure punti elenco brevi.
    Restituisce il primo gruppo adatto (inizio, fine esclusa) o null. */
export function cardRun(blocks: Block[]): { start: number; end: number; kind: 'h4' | 'li'; n: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    if (b.type === 'h4') {
      let j = i, n = 0, ok = true
      while (j < blocks.length && blocks[j]!.type === 'h4') {
        let k = j + 1, chars = tlen((blocks[j] as { html: string }).html)
        while (k < blocks.length && (blocks[k]!.type === 'p' || blocks[k]!.type === 'li') && k - j <= 3) { chars += tlen((blocks[k] as { html: string }).html); k++ }
        if (k === j + 1 || k - j > 3 || chars > 460) { ok = n >= 3; break }
        n++; j = k
        if (n === 8) break
      }
      if (ok && n >= 3) return { start: i, end: j, kind: 'h4', n }
    }
    if (b.type === 'li') {
      let j = i
      while (j < blocks.length && blocks[j]!.type === 'li' && tlen((blocks[j] as { html: string }).html) <= 260 && j - i < 8) j++
      if (j - i >= 3 && (j === blocks.length || blocks[j]!.type !== 'li')) return { start: i, end: j, kind: 'li', n: j - i }
      while (i + 1 < blocks.length && blocks[i + 1]!.type === 'li') i++
    }
  }
  return null
}

/* ------------------------------------------------------------------ renderer */
export type ImgMap = Map<string, string>

class Renderer {
  F: F
  contentW: number
  B: BrandDef
  /** sezione in modalità «citazione»: le citazioni diventano grandi, a tutta larghezza */
  bigQuote = false
  constructor(public doc: Doc, public mode: 'digital' | 'print', public imgs: ImgMap, public base: string) {
    this.F = FORMATS[doc.meta.format as 'a4v' | 'a4o'] ?? FORMATS.a4v
    this.B = brandOf(doc.meta.brand)
    this.contentW = this.F.PW - this.F.ML - this.F.MR
  }
  img(ref: ImageRef | null | undefined, w: number, h: number) { return ref?.asset ? this.imgs.get(imageKey(ref, w, h)) ?? null : null }
  whole(id: string | null | undefined, w: number) { return id ? this.imgs.get(imageKey({ asset: id, cx: 0, cy: 0, zoom: 0 }, w, 0)) ?? null : null }
  cap(t: string) { return t ? `<div class="bcap">${esc(t)}</div>` : '' }
  rowsOf(b: TableBlock) {
    let rows = (b.rows || []).filter(r => r.some(c => (c || '').trim())).map(r => [...r])
    if (b.header && b.view !== 'tabella') rows = rows.slice(1)
    return rows
  }

  table(b: TableBlock): string {
    const rows = (b.rows || []).map(r => [...r])
    if (!rows.length) return ''
    const nc = Math.max(...rows.map(r => r.length))
    const head = b.header !== false ? rows[0]! : null
    const body = b.header !== false ? rows.slice(1) : rows
    const numcols = new Set<number>()
    for (let j = 1; j < nc; j++) {
      const vals = body.map(r => r[j] ?? '').filter(v => v.trim())
      if (vals.length && vals.every(isnum)) numcols.add(j)
    }
    const th = head ? `<thead><tr>${head.map((c, j) => `<th class="${numcols.has(j) ? 'num' : ''}">${inline(c)}</th>`).join('')}</tr></thead>` : ''
    const trs = body.map(r => {
      const filled = r.filter(c => (c || '').trim())
      if (filled.length === 1 && nc > 2 && (r[0] || '').trim()) return `<tr class="grp"><td colspan="${nc}">${inline(r[0]!)}</td></tr>`
      const tot = /^(Totale|Total)/.test(plain(r[0] ?? '')) ? ' tot' : ''
      const cells = [...r, ...Array(Math.max(0, nc - r.length)).fill('')]
      return `<tr>${cells.map((c, j) => `<td class="${numcols.has(j) ? 'num' : ''}${tot}">${(c || '').split('\n').map(inline).join('<br>')}</td>`).join('')}</tr>`
    }).join('')
    return `<div class="tbox">${this.cap(b.caption)}<table>${th}<tbody>${trs}</tbody></table></div>`
  }

  view(b: TableBlock): string {
    if (b.view === 'tabella') return this.table(b)
    const R = this.rowsOf(b)
    if (!R.length) return ''
    const cap = this.cap(b.caption)
    const c0 = (r: string[]) => r[0] ?? '', c1 = (r: string[]) => r[1] ?? ''
    const F = this.F
    switch (b.view) {
      case 'kpi': {
        const n = R.length
        const cols = n !== 4 || F.KPIMAX === 4 ? Math.min(n, F.KPIMAX) : 2
        return `<div class="box">${cap}<div class="kpi c${cols}">${R.map(r => `<div class="k"><div class="kn">${inline(c0(r))}</div><div class="kl">${inline(c1(r))}</div></div>`).join('')}</div></div>`
      }
      case 'timeline':
        return `<div class="box">${cap}${R.map((r, j) => {
          const m = plain(c1(r)).match(/^([^:]{2,80}): (.+)$/)
          const body = m ? `<div class="tt">${esc(m[1]!)}:</div><div class="td">${esc(m[2]!)}</div>` : `<div class="tt">${inline(c1(r))}</div>`
          return `<div class="trow${j === R.length - 1 ? ' last' : ''}"><div class="ty">${inline(c0(r))}</div><div class="tb">${body}</div></div>`
        }).join('')}</div>`
      case 'valori':
        return `<div class="box">${cap}${R.map(r => `<div class="vrow"><div class="vn">${inline(c0(r))}</div><div class="vd">${inline(c1(r))}</div></div>`).join('')}</div>`
      case 'elenco': {
        const n = R.length
        const cols = n === 2 || n === 4 ? 2 : Math.min(n, F.ELMAX)
        const items = R.map((r, j) => {
          const ic = this.whole(b.icons?.[j], 11)
          const mark = ic ? `<img class="eic" src="${ic}" alt="">` : `<div class="enum">${j + 1}</div>`
          let head = '', txt = c0(r)
          if (r.length >= 2 && c1(r).trim()) {
            head = /^\s*\d+[.)]?\s*$/.test(plain(c0(r))) ? '' : `<div class="eh">${inline(c0(r))}</div>`
            txt = c1(r)
          }
          return `<div class="ei">${mark}${head}<div class="et">${inline(txt)}</div></div>`
        }).join('')
        return `<div class="box">${cap}<div class="el c${cols}">${items}</div></div>`
      }
      case 'barre':
      case 'segmenti': {
        const data = R.map(r => {
          const a = c0(r), z = c1(r)
          return parseNum(plain(a)) !== null && parseNum(plain(z)) === null ? { l: z, v: parseNum(plain(a)) ?? 0, raw: a } : { l: a, v: parseNum(plain(z)) ?? 0, raw: z }
        })
        if (b.view === 'barre') {
          const mx = Math.max(...data.map(d => d.v)) || 1
          return `<div class="box">${cap}${data.map(d => `<div class="frow"><div class="fl">${inline(d.l)}</div><div class="fb"><div class="fbar" style="width:${Math.max(d.v / mx * 82, 0.5).toFixed(1)}%"></div><span class="fv">${inline(d.raw)}</span></div></div>`).join('')}</div>`
        }
        const tot = data.reduce((s, d) => s + d.v, 0) || 1
        return `<div class="box">${cap}<div class="bar">${data.map((d, j) => `<div class="seg s${j % 6}" style="width:${(d.v / tot * 100).toFixed(2)}%"></div>`).join('')}</div><div class="labs">${data.map((d, j) => `<div class="lab"><span class="sw s${j % 6}"></span>${inline(d.l)} ${inline(d.raw)}</div>`).join('')}</div></div>`
      }
      case 'codici':
        return `<div class="box">${cap}<div class="cgrid">${R.map(r => `<div class="cc"><div class="code">${inline(c0(r))}</div><div class="cd">${inline(c1(r))}</div></div>`).join('')}</div></div>`
    }
    return this.table(b)
  }

  block(b: Block, cols: 1 | 2 | 'w'): string {
    const bid = ` data-bid="${attr(b.id)}"`
    switch (b.type) {
      case 'p': return `<p${bid}>${inline(b.html)}</p>`
      case 'h4': return `<h4${bid}>${inline(b.html)}</h4>`
      case 'li': return `<p class="li"${bid}>${inline(b.html)}</p>`
      case 'quote': return `<blockquote class="${this.bigQuote ? 'big' : cols === 1 && this.F.C1COLS === 1 ? 'side' : ''}"${bid}>${inline(b.html)}</blockquote>`
      case 'note': return `<p class="note"${bid}>${inline(b.html)}</p>`
      case 'sign': return `<p class="sign"${bid}>${inline(b.html)}</p>`
      case 'table': return this.view(b).replace(/^<div class="(box|tbox)"/, `<div class="$1"${bid}`)
      case 'image': {
        const w = this.contentW
        const src = this.img(b.image, w, w * (b.ratio || 0.5625))
        if (!src) return `<figure${bid}><figcaption>[immagine da scegliere${b.hint ? `: ${esc(b.hint)}` : ''}]</figcaption></figure>`
        return `<figure${bid}><img src="${src}" alt="">${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ''}</figure>`
      }
    }
  }

  /** voci brevi come card grigie, a righe (così una riga intera passa alla pagina dopo, mai tagliata) */
  cards(blocks: Block[], kind: 'h4' | 'li'): string {
    const groups: Block[][] = []
    for (const b of blocks) { if (kind === 'li' || b.type === 'h4') groups.push([b]); else groups[groups.length - 1]!.push(b) }
    const n = groups.length, longest = Math.max(...groups.map(g => g.reduce((c, b) => c + tlen((b as { html: string }).html), 0)))
    const per = this.F.PW > 250 ? (n === 4 || n === 8 ? 4 : 3) : (n % 3 === 0 && longest <= 260 ? 3 : 2)
    const card = (g: Block[], j: number) => `<div class="card">${kind === 'li' ? `<div class="enum">${j + 1}</div>` : ''}${g.map(b => b.type === 'h4' ? `<h4 data-bid="${attr(b.id)}">${inline(b.html)}</h4>` : `<p data-bid="${attr(b.id)}">${inline((b as { html: string }).html)}</p>`).join('')}</div>`
    const rows: string[] = []
    for (let i = 0; i < n; i += per) rows.push(`<div class="cardrow"><div class="cards c${per}">${groups.slice(i, i + per).map((g, k) => card(g, i + k)).join('')}${Array(Math.max(0, per - groups.slice(i, i + per).length)).fill('<div></div>').join('')}</div></div>`)
    return rows.join('')
  }

  flow(body: string[], ncols: number) {
    if (ncols <= 1) return body.join('')
    const span = /^<(blockquote|figure|div class="(box|tbox|cardrow))/
    const out: string[] = []
    let run: string[] = []
    for (const h of body) {
      if (span.test(h)) { if (run.length) { out.push(`<div class="cols">${run.join('')}</div>`); run = [] } out.push(h) } else run.push(h)
    }
    if (run.length) out.push(`<div class="cols">${run.join('')}</div>`)
    return out.join('')
  }

  section(s: Section, chapname: string, first: boolean): string {
    const F = this.F, L = s.layout || ({} as Section['layout']), sid = attr(s.id), logo = (n: string) => `${this.base}logos/${this.B.dir}${n}`
    if (L.mode === 'highlights') {
      const tab = s.blocks.find(b => b.type === 'table') as TableBlock | undefined
      const items = tab ? this.rowsOf(tab).map(r => `<div class="hk"><div class="hn">${inline(r[0] ?? '')}</div><div class="hl">${inline(r[1] ?? '')}</div></div>`).join('') : ''
      const txt = s.blocks.filter(b => b.type === 'p' || b.type === 'li' || b.type === 'note').map(b => this.block(b, 1)).join('')
      return `<div class="hl-page" id="${sid}" data-bid="${sid}">${s.title ? `<div class="sechead"><h3>${esc(s.title)}</h3></div>` : ''}${txt ? `<div class="hlead">${txt}</div>` : ''}<div class="hgrid"${tab ? ` data-bid="${attr(tab.id)}"` : ''}>${items}</div></div>`
    }
    const cols = L.cols ?? 2
    const ccls = cols === 1 ? 'c1' : cols === 'w' ? 'cw' : 'c2'
    const ncols = cols === 1 ? F.C1COLS : cols === 2 ? F.C2COLS : 1
    let band = ''
    const bi = L.band ? this.img(L.band, F.PW + 6, F.BAND) : null
    if (bi) band = `<div class="pfl"><img src="${logo('logo-mark-black.svg')}" alt=""></div><div class="pfr"></div>`
      + `<div class="band" style="background-image:linear-gradient(to top, rgba(${this.B.vars['--shade']},.55), rgba(${this.B.vars['--shade']},0) 30%), url(${bi})"><div class="bfoot"><img src="${logo('logo-mark-white.svg')}" alt=""><span class="bpn"></span></div></div>`
    const body: string[] = []
    let lead = '', firstText = true
    this.bigQuote = L.look === 'citazione'
    const run = L.look === 'card' ? cardRun(s.blocks) : null
    for (let i = 0; i < s.blocks.length; i++) {
      const b = s.blocks[i]!
      if (run && i === run.start) { body.push(this.cards(s.blocks.slice(run.start, run.end), run.kind)); i = run.end - 1; firstText = false; continue }
      if (b.type === 'p' && firstText && cols !== 'w' && !body.length && b.lead !== false) {
        lead = `<p class="lead" data-bid="${attr(b.id)}">${inline(b.html)}</p>`
        firstText = false
        continue
      }
      if (b.type === 'p' || b.type === 'h4') firstText = false
      body.push(this.block(b, cols))
    }
    this.bigQuote = false
    // dato in apertura: il numero in grande, l'unità di misura (dipendenti, tCO2e, ore…) più piccola sotto
    const hm = L.hero?.n ? L.hero.n.trim().match(/^([€$]?\s?[\d.,]+\s?(?:%|€|\+)?)\s*(.*)$/) : null
    const hero = L.look === 'dato' && L.hero?.n ? `<div class="dato"><div class="dn">${esc(hm ? hm[1]!.trim() : L.hero.n)}${hm?.[2] ? `<span class="du">${esc(hm[2])}</span>` : ''}</div><div class="dl">${esc(L.hero.l)}</div></div>` : ''
    const oi = L.ornament && cols === 1 ? this.whole(L.ornament, F.SIDEW) : null
    const orn = oi ? `<img class="orn" src="${oi}" alt="">` : ''
    const tight = Math.min(Number(L.tight || 0), 3)
    const cls = `sec ${ccls}${band ? ' hasband' : ''}${tight ? ` tight t${tight}` : ''}${L.newpage && !first ? ' newpage' : ''}`
    return `<section class="${cls}" id="${sid}" data-bid="${sid}">${band}<div class="head">${band ? `<div class="chapmark">${esc(chapname)}</div>` : ''}<div class="sechead${orn ? ' has-orn' : ''}">${orn}${s.title ? `<h3>${esc(s.title)}</h3>` : ''}</div>${hero}${lead}</div><div class="flow">${this.flow(body, ncols)}</div></section>`
  }

  html(): string {
    const F = this.F, d = this.doc, logo = (n: string) => `${this.base}logos/${this.B.dir}${n}`, dark = this.B.vars['--b900']
    const parts: string[] = [`<div class="pfl"><img src="${logo('logo-mark-black.svg')}" alt=""></div><div class="pfr"></div>`]
    const PWB = F.PW + 6, PHB = F.PH + 6
    const ci0 = this.img(d.cover.image, PWB, PHB)
    parts.push(`<div class="cover" data-bid="${attr(d.cover.id || 'cover')}"><div class="ph" style="${ci0 ? `background-image:url(${ci0})` : `background:${dark}`}"></div><div class="shade-top"></div><div class="shade-bot"></div>`
      + `<img class="logo" src="${logo('logo-white.svg')}" alt="${this.B.name}"><div class="ctitle"><h1>${esc(d.cover.title || '')}</h1><div class="csub">${esc(d.cover.subtitle || '')}</div></div></div>`)
    if (d.toc?.show !== false && d.chapters.length) {
      const tl = d.chapters.map((ch, i) => `<div class="tc"><a href="#${attr(ch.id)}"><span class="tn">${pad(i + 1)}</span>${esc(ch.title)}</a></div>`
        + ch.sections.filter(s => s.title).map(s => `<div class="ts"><a class="tlink" href="#${attr(s.id)}">${esc(s.title)}</a></div>`).join('')).join('')
      parts.push(`<div class="tocpage" data-bid="toc"><div class="sechead"><h3>${esc(d.toc?.title || 'Sommario')}</h3></div><div class="toc">${tl}</div></div>`)
    }
    d.chapters.forEach((ch, i) => {
      const oi = this.img(ch.image, PWB, PHB)
      const chapname = `${pad(i + 1)} ${ch.title}`
      parts.push(`<div class="opener" id="${attr(ch.id)}" data-bid="${attr(ch.id)}"><div class="ph" style="${oi ? `background-image:url(${oi})` : `background:${dark}`}"></div><div class="shade-top"></div><div class="shade-bot soft"></div>`
        + `<div class="otext"><span class="chip">${esc(chapname)}</span><h2>${esc(ch.title)}</h2></div><ul class="osec">${ch.sections.filter(s => s.title).map(s => `<li>${esc(s.title)}</li>`).join('')}</ul>`
        + `<img class="omark" src="${logo('logo-mark-white.svg')}" alt=""><div class="chapmark">${esc(chapname)}</div></div>`)
      ch.sections.forEach((s, si) => parts.push(this.section(s, chapname, si === 0)))
    })
    if (d.back?.show !== false) parts.push(`<div class="back" data-bid="back"><img class="logo" src="${logo('logo-white.svg')}" alt="${this.B.name}"></div>`)
    return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(d.meta.title || d.cover.title)} — ${this.B.name}</title>`
      + `<style>${cssFor(d.meta.format === 'a4o' ? 'a4o' : 'a4v', this.mode, this.base, this.B)}</style></head><body>${parts.join('')}</body></html>`
  }
}

export const buildHtml = (doc: Doc, mode: 'digital' | 'print', imgs: ImgMap, base: string) =>
  doc.meta.kind === 'brochure' ? buildBrochure(doc, mode, imgs, base) : new Renderer(doc, mode, imgs, base).html()

/** Tutte le immagini che servono al documento, con la misura in mm (per il ritaglio). */
export function imageNeeds(doc: Doc): { ref: ImageRef; w: number; h: number; whole?: boolean }[] {
  if (doc.meta.kind === 'brochure') return brochureNeeds(doc)
  const F = FORMATS[doc.meta.format as 'a4v' | 'a4o'] ?? FORMATS.a4v
  const out: { ref: ImageRef; w: number; h: number; whole?: boolean }[] = []
  const PWB = F.PW + 6, PHB = F.PH + 6, cw = F.PW - F.ML - F.MR
  if (doc.cover.image) out.push({ ref: doc.cover.image, w: PWB, h: PHB })
  for (const ch of doc.chapters) {
    if (ch.image) out.push({ ref: ch.image, w: PWB, h: PHB })
    for (const s of ch.sections) {
      if (s.layout?.band) out.push({ ref: s.layout.band, w: PWB, h: F.BAND })
      if (s.layout?.ornament && s.layout.cols === 1) out.push({ ref: { asset: s.layout.ornament, cx: 0, cy: 0, zoom: 0 }, w: F.SIDEW, h: 0, whole: true })
      for (const b of s.blocks) {
        if (b.type === 'image' && b.image) out.push({ ref: b.image, w: cw, h: cw * (b.ratio || 0.5625) })
        if (b.type === 'table' && b.view === 'elenco') for (const ic of b.icons || []) if (ic) out.push({ ref: { asset: ic, cx: 0, cy: 0, zoom: 0 }, w: 11, h: 0, whole: true })
      }
    }
  }
  return out
}
