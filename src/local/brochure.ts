/* Motore della brochure: documento (JSON a blocchi) -> HTML paginato, sul modello delle brochure OpenEconomics
   (OpenEconomics/Contesto/OE_Brochure_*.pdf). Ogni sezione del Word è una pagina; il tipo di pagina
   (section.layout.page) decide la composizione: testo, card, colore, prodotto, numeri, griglia, citazione.
   Le pagine al vivo (copertina, aperture, pagine colore, chiusura) hanno una regola @page propria con la foto
   come sfondo, così marchio e numero di pagina restano nei margini e diventano bianchi. */
import css from './brochure.css?raw'
import type { Block, Doc, ImageRef, PageType, Section, TableBlock, TextBlock } from '../types'
import { imageKey } from './images'
import { brandOf, type BrandDef } from './brand'
import { applyBrand, inline, type ImgMap } from './engine'

export const BR = { PW: 303, PH: 177, M: 12.7 }
const PWB = BR.PW + 6, PHB = BR.PH + 6
const CIRCLE = 154

const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const attr = (s: string) => esc(s).replace(/"/g, '&quot;')

/* Elementi a pixel dei fondi (indice e pagine di testo), disegnati come nella brochure. */
function pixSide(): string {
  const w = 76.1 / 9, h = [101, 118, 109, 135, 126, 152, 143, 164.2, 164.2]
  let r = ''
  h.forEach((y, i) => { r += `<rect x='${(i * w).toFixed(2)}' y='0' width='${(w + 0.05).toFixed(2)}' height='${y}'/>` })
  r += `<rect x='${(6 * w).toFixed(2)}' y='151.6' width='${(w * 3).toFixed(2)}' height='25.4'/>`
  return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 76.1 177' fill='%23F0F0F0'>${r}</svg>`)
}
function pixGrey(): string {
  const c = 9.25
  let r = ''
  for (const x0 of [9.3, 138.2, 267.1]) {
    const steps = [[0, 2], [1, 1], [2, 3], [3, 1], [4, 2], [5, 4], [6, 2], [7, 3], [8, 1], [9, 2], [10, 3], [11, 1], [12, 2]]
    for (const [i, n] of steps) { const x = x0 + i! * c; if (x > 303) continue; r += `<rect x='${x.toFixed(2)}' y='${(55.4 - n! * c).toFixed(2)}' width='${c}' height='${(n! * c).toFixed(2)}'/>` }
  }
  return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 303 55.4' fill='%23F8F8F8'>${r}</svg>`)
}
const svgUrl = (s: string) => `url("data:image/svg+xml;utf8,${s.replace(/"/g, "'").replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`

const ARROW = (ink: string) => `<svg viewBox="0 0 72 72"><path d="M22 22 L50 50 M50 26 V50 H26" fill="none" stroke="${ink}" stroke-width="4.2" stroke-linecap="square"/></svg>`
const GLOBE = (ink: string) => `<svg viewBox="0 0 65 65"><g fill="none" stroke="${ink}" stroke-width="3.2"><circle cx="32.5" cy="32.5" r="15"/><path d="M17.5 32.5h30M32.5 17.5c-8 8-8 22 0 30M32.5 17.5c8 8 8 22 0 30"/></g></svg>`
const MAIL = (ink: string) => `<svg viewBox="0 0 65 65"><g fill="none" stroke="${ink}" stroke-width="3.2"><rect x="17" y="21" width="31" height="23"/><path d="M17 21l15.5 13L48 21"/></g></svg>`

export interface BrandBack { site: string; about: string; offices: { name: string; lines: string[] }[]; links: { icon: 'web' | 'mail' | 'link'; label: string }[] }
/** Dati della chiusura (dalla brochure OE). Per Civiqa e T33 restano quelli di OpenEconomics finché non ne arrivano di propri. */
export const BACK: BrandBack = {
  site: 'openeconomics.eu',
  about: '',
  offices: [
    { name: 'Roma', lines: ['Via Vitorchiano, 123', '00189 Roma (RM)', '+39 06 8414537'] },
    { name: 'Milano', lines: ['Via Nino Bixio, 7', '20129 Milano (MI)'] },
    { name: 'Cosenza', lines: ['Via J. F. Kennedy 57/59', '87036 Rende (CS)', '+39 0984 302539'] },
    { name: 'Ancona - Sede T33', lines: ['Via Calatafimi 1', '60121, Ancona (AN)', '+39.071.9715460'] },
  ],
  links: [
    { icon: 'web', label: 'www.openeconomics.eu' },
    { icon: 'mail', label: 'mail@openeconomics.eu' },
    { icon: 'link', label: 'https://www.linkedin.com/company/openeconomics' },
  ],
}

/** Voci di una sezione (card, griglia, voci del testo): dalla prima tabella o dalle coppie sottotitolo + testo. */
interface Item { title: string; text: string; icon?: string | null; bid: string; parts?: TextBlock[] }
function itemsOf(s: Section): { items: Item[]; from: 'table' | 'pairs' | 'none'; table?: TableBlock; used: Set<string> } {
  const used = new Set<string>()
  const tab = s.blocks.find(b => b.type === 'table' && b.view !== 'kpi') as TableBlock | undefined
  if (tab) {
    const rows = (tab.rows || []).filter(r => r.some(c => (c || '').trim())).slice(tab.header && tab.view === 'tabella' ? 1 : 0)
    used.add(tab.id)
    return { items: rows.map((r, j) => ({ title: r.length > 1 ? r[0] ?? '' : '', text: r.length > 1 ? r.slice(1).join(' ') : r[0] ?? '', icon: tab.icons?.[j], bid: tab.id })), from: 'table', table: tab, used }
  }
  const items: Item[] = []
  let cur: Item | null = null
  for (const b of s.blocks) {
    if (b.type === 'h4') { cur = { title: b.html, text: '', bid: b.id, parts: [] }; items.push(cur); used.add(b.id); continue }
    if (cur && (b.type === 'p' || b.type === 'li')) { cur.text += (cur.text ? '<br>' : '') + b.html; cur.parts!.push(b); used.add(b.id); continue }
    if (b.type !== 'p' && b.type !== 'li') cur = null
  }
  return { items, from: items.length ? 'pairs' : 'none', used }
}

/** Tipo di pagina suggerito per una sezione importata dal Word. */
export function guessPage(s: Section): PageType {
  const blocks = s.blocks
  const nText = blocks.filter(b => b.type === 'p' || b.type === 'li').length
  if (blocks.some(b => b.type === 'table' && b.view === 'kpi')) return 'numeri'
  const tab = blocks.find(b => b.type === 'table') as TableBlock | undefined
  const nh4 = blocks.filter(b => b.type === 'h4').length
  if (tab) { const n = tab.rows.filter(r => r.some(c => c.trim())).length; return n >= 6 ? 'griglia' : 'card' }
  if (blocks.length && blocks.every(b => b.type === 'quote' || b.type === 'p') && blocks.some(b => b.type === 'quote') && nText <= 1) return 'citazione'
  if (nh4 >= 5) return 'griglia'
  if (blocks.some(b => b.type === 'image')) return 'prodotto'
  // una riga in maiuscolo, un testo e tre punti in elenco: è la pagina prodotto (Externalytics, Sonar)
  const nli = blocks.filter(b => b.type === 'li').length
  if (nh4 <= 1 && nli >= 2 && nli <= 4) return 'prodotto'
  // pochi paragrafi brevi senza voci: pagina a colore (come «Value proposition» nella brochure OE)
  const chars = blocks.reduce((n, b) => n + ('html' in b ? b.html.length : 0), 0)
  if (!nh4 && nText >= 1 && nText <= 4 && chars < 700) return 'colore'
  return 'testo'
}

class Brochure {
  B: BrandDef
  pages: string[] = []
  n = 0
  /** numero di pagina di ogni sezione (per l'indice): ogni sezione è una pagina */
  pageOf = new Map<string, number>()
  constructor(public doc: Doc, public mode: 'digital' | 'print', public imgs: ImgMap, public base: string) { this.B = brandOf(doc.meta.brand) }
  logo(n: string) { return `${this.base}logos/${this.B.dir}${n}` }
  img(ref: ImageRef | null | undefined, w: number, h: number) { return ref?.asset ? this.imgs.get(imageKey(ref, w, h)) ?? null : null }
  whole(id: string | null | undefined, w: number) { return id ? this.imgs.get(imageKey({ asset: id, cx: 0, cy: 0, zoom: 0 }, w, 0)) ?? null : null }

  /** Una pagina: fondo (classe o stile, esteso nelle abbondanze), contenuto nei margini, marchio e numero. */
  page(o: { cls: string; bid: string; id?: string; bg?: string; bgCls?: string; dark?: boolean; num?: boolean; tall?: boolean; body: string; outside?: string }) {
    this.n++
    const num = o.num !== false
    this.pages.push(`<div class="pg${o.dark ? ' dark' : ''}${o.tall ? ' tall' : ''}"${o.id ? ` id="${attr(o.id)}"` : ''} data-bid="${attr(o.bid)}">`
      + `<div class="pgbg${o.bgCls ? ` ${o.bgCls}` : ''}"${o.bg ? ` style="background:${attr(o.bg)}"` : ''}></div>`
      + (o.outside ?? '')
      + `<div class="pgc ${o.cls}">${o.body}</div>`
      + (num ? `<img class="pmark" src="${this.logo(o.dark ? 'logo-mark-white.svg' : 'logo-mark-black.svg')}" alt=""><span class="pnum">${this.n}</span>` : '')
      + '</div>')
  }
  photoBg(ref: ImageRef | null | undefined, veil: string, fallback: string) {
    const u = this.img(ref, PWB, PHB)
    return u ? `${veil ? veil + ', ' : ''}url(${u}) center / cover no-repeat` : fallback
  }

  chip(label: string, dark = false) {
    return label ? `<div class="chiprow"><div class="ci">${ARROW(this.B.vars[dark ? '--dark-ink' : '--chip-ink']!)}</div><div class="cl">${esc(label)}</div></div>` : ''
  }

  cover() {
    const d = this.doc, v = this.B.vars
    const shade = `rgba(${v['--shade']},.55)`
    const bg = this.photoBg(d.cover.image, `linear-gradient(to top, ${shade} 0%, rgba(${v['--shade']},0) 45%)`, `linear-gradient(135deg, ${v['--b700']} 0%, ${v['--b900']} 100%)`)
    this.page({ cls: 'bcover', bid: d.cover.id || 'cover', bg, dark: true, num: false, tall: true, body: `<div class="top"><img class="logo" src="${this.logo('logo-white.svg')}" alt="${this.B.name}"><span class="site">${esc(BACK.site)}</span></div>`
      + `<div class="bot"><div>${this.chip(d.cover.subtitle, true)}<h1>${esc(d.cover.title || '')}</h1></div><div class="ring"><img src="${this.logo('logo-mark-white.svg')}" alt=""></div></div>` })
  }

  toc() {
    const d = this.doc
    if (d.toc?.show === false || !d.chapters.length) return
    const cols = d.chapters.map(ch => `<div class="tcol"><p class="tg">${esc(ch.title)}</p>`
      + ch.sections.filter(s => !s.cont).map(s => `<a class="te" href="#${attr(s.id)}"><span class="tn">${String(this.pageOf.get(s.id) ?? 0).padStart(2, '0')}.</span><span><span class="tk">${esc(s.kicker || '')}</span>${esc(s.title)}</span></a>`).join('') + '</div>').join('')
    this.page({ cls: 'btoc', bid: 'toc', bgCls: 'bg-grey', body: `<h2 class="h2">${esc(d.toc?.title || 'Indice')}</h2><div class="tcols">${cols}</div>` })
  }

  opener(ch: Doc['chapters'][number]) {
    const v = this.B.vars
    const bg = this.photoBg(ch.image, `linear-gradient(to bottom, rgba(${v['--shade']},.45) 0%, rgba(${v['--shade']},0) 40%)`, v['--b900']!)
    this.page({ cls: 'bopen', bid: ch.id, id: ch.id, bg, dark: true, body: `<h2>${esc(ch.title)}</h2>` })
  }

  /** testo di una voce: i paragrafi restano blocchi separati (cliccabili e commentabili) */
  itemText(x: Item, cls: string) {
    return x.parts?.length ? x.parts.map(b => `<p class="${cls}${b.type === 'li' ? ' li' : ''}" data-bid="${attr(b.id)}">${inline(b.html)}</p>`).join('') : `<div class="${cls}">${inline(x.text)}</div>`
  }

  text(b: Block): string {
    const bid = ` data-bid="${attr(b.id)}"`
    if (b.type === 'li') return `<p class="li"${bid}>${inline(b.html)}</p>`
    if (b.type === 'h4') return `<p class="ih"${bid}>${inline(b.html)}</p>`
    if (b.type === 'quote') return `<p class="qt"${bid}>${inline(b.html)}</p>`
    if (b.type === 'p' || b.type === 'note' || b.type === 'sign') return `<p${bid}>${inline(b.html)}</p>`
    return ''
  }

  section(s: Section, ch: Doc['chapters'][number]) {
    const page = s.layout.page ?? 'testo'
    const label = s.kicker || ch.title
    const sid = attr(s.id)
    const v = this.B.vars
    const title = s.title ? `<h2 class="h2">${esc(s.title)}</h2>` : ''
    const head = this.chip(label, page === 'colore') + title
    const rest = (used: Set<string>) => s.blocks.filter(b => !used.has(b.id))
    let body = '', cls = 'bsec', bgCls = '', bg = '', dark = false, extra = ''
    const it = itemsOf(s)

    switch (page) {
      case 'card': {
        bgCls = 'bg-dots'
        const cards = it.items.map(x => {
          const ic = this.whole(x.icon, 6.4)
          return `<div class="card">${ic ? `<div class="cic"><img src="${ic}" alt=""></div>` : ''}<p class="ch"${x.parts ? ` data-bid="${attr(x.bid)}"` : ''}>${inline(x.title)}</p>${this.itemText(x, 'ct')}</div>`
        }).join('')
        const intro = rest(it.used).map(b => this.text(b)).join('')
        body = `${intro ? `<div class="intro">${intro}</div>` : ''}<div class="cards"${it.table ? ` data-bid="${attr(it.table.id)}"` : ''}>${cards}</div>`
        break
      }
      case 'griglia': {
        bgCls = 'bg-dots'
        const n = it.items.length
        const cells = it.items.map(x => `<div><p class="gh"${x.parts ? ` data-bid="${attr(x.bid)}"` : ''}>${inline(x.title)}</p>${this.itemText(x, 'gt')}</div>`).join('')
        const intro = rest(it.used).map(b => this.text(b)).join('')
        body = `${intro ? `<div class="intro">${intro}</div>` : ''}<div class="grid4${n === 3 || n === 6 ? ' n3' : ''}"${it.table ? ` data-bid="${attr(it.table.id)}"` : ''}>${cells}</div>`
        break
      }
      case 'numeri': {
        const tab = s.blocks.find(b => b.type === 'table' && b.view === 'kpi') as TableBlock | undefined
          ?? s.blocks.find(b => b.type === 'table') as TableBlock | undefined
        const used = new Set<string>(tab ? [tab.id] : [])
        const rows = tab ? (tab.rows || []).filter(r => r.some(c => (c || '').trim())).slice(tab.header && tab.view === 'tabella' ? 1 : 0) : []
        const n = Math.min(Math.max(rows.length, 3), 6)
        const nums = rows.map(r => {
          const [val = '', a = '', b = ''] = r
          const unit = r.length >= 3 ? a : '', desc = r.length >= 3 ? b : a
          return `<div class="kn"><div class="kv">${inline(val)}</div>${unit ? `<div class="ku">${inline(unit)}</div>` : ''}<div class="kd">${inline(desc)}</div></div>`
        }).join('')
        const imgB = s.blocks.find(b => b.type === 'image')
        if (imgB) used.add(imgB.id)
        const logos = imgB && imgB.type === 'image' && imgB.image ? this.whole(imgB.image.asset, 277.6) : null
        const others = rest(used).map(b => this.text(b)).join('')
        body = `${others ? `<div class="intro">${others}</div>` : ''}<div class="knums n${n}"${tab ? ` data-bid="${attr(tab.id)}"` : ''}>${nums}</div>`
        if (imgB) extra = `<div class="logoband" data-bid="${attr(imgB.id)}">${logos ? `<img src="${logos}" alt="">` : '<span class="ph-empty">[loghi: scegli un\'immagine]</span>'}</div>`
        break
      }
      case 'citazione': {
        cls += ' bquote'
        const q = s.blocks.map(b => b.type === 'quote' ? `<p class="q" data-bid="${attr(b.id)}">${inline(b.html)}</p>` : this.text(b)).join('')
        return this.page({ cls, bid: s.id, id: s.id, body: q })
      }
      case 'colore': {
        cls += ' bcolor onphoto'
        dark = true
        bg = (this.photoBg(s.layout.band, `linear-gradient(to right, rgba(${hexRgb(v['--b700']!)},.92) 0%, rgba(${hexRgb(v['--b700']!)},.55) 38%, rgba(${hexRgb(v['--b700']!)},0) 62%)`, `linear-gradient(120deg, ${v['--b700']} 0%, ${v['--b500']} 100%)`))
        body = `<div class="txt">${s.blocks.map(b => b.type === 'h4' ? `<p class="ih" data-bid="${attr(b.id)}" style="color:${v['--on-dark']};text-transform:uppercase">${inline(b.html)}</p>` : this.text(b)).join('')}</div>`
        break
      }
      case 'prodotto': {
        cls += ' bprod'
        const fit = s.layout.circleFit ?? 'ritaglia'
        const im = fit === 'sopra' ? (s.layout.band ? this.whole(s.layout.band.asset, 155.6) : null) : this.img(s.layout.band, CIRCLE, CIRCLE)
        extra = `<div class="circle c-${s.layout.circle ?? 'magenta'} fit-${fit}">${im ? `<img src="${im}" alt="">` : ''}</div>`
        const subs = s.blocks.filter((b): b is TextBlock => b.type === 'h4')
        const feats = s.blocks.filter((b): b is TextBlock => b.type === 'li')
        const txt = s.blocks.filter(b => b.type !== 'h4' && b.type !== 'li').map(b => this.text(b)).join('')
        body = `<div class="left">${subs.map(b => `<p class="sub" data-bid="${attr(b.id)}">${inline(b.html)}</p>`).join('')}${txt}`
          + (feats.length ? `<div class="feats">${feats.map(b => `<p class="feat" data-bid="${attr(b.id)}">${inline(b.html)}</p>`).join('')}</div>` : '') + '</div>'
        return this.page({ cls, bid: s.id, id: s.id, outside: extra, body: `<div class="left">${head}</div>${body}` })
      }
      default: {
        bgCls = 'bg-pix'
        if (it.from === 'pairs') {
          const first = s.blocks.findIndex(b => b.type === 'h4')
          const intro = s.blocks.slice(0, first).map(b => this.text(b)).join('')
          const after = s.blocks.slice(first).filter(b => !it.used.has(b.id)).map(b => this.text(b)).join('')
          body = (intro ? `<div class="intro">${intro}</div>` : '')
            + `<div class="items${it.items.length > 4 ? ' n3' : ''}">${it.items.map(x => `<div class="it"><p class="ih" data-bid="${attr(x.bid)}">${inline(x.title)}</p>${this.itemText(x, 'itx')}</div>`).join('')}</div>`
            + (after ? `<div class="closing">${after}</div>` : '')
        } else {
          const all = s.blocks.map(b => b.type === 'image' ? '' : this.text(b)).join('')
          body = `<div class="${all.length > 900 ? 'cols2' : 'intro'}">${all}</div>`
        }
      }
    }
    this.page({ cls, bid: s.id, id: s.id, bg, bgCls, dark, outside: extra, body: head + body })
  }

  back() {
    const d = this.doc, v = this.B.vars
    if (d.back?.show === false) return
    const bg = this.photoBg(d.back.image, `linear-gradient(to top, rgba(${v['--shade']},.5) 0%, rgba(${v['--shade']},0) 50%)`, v['--b700']!)
    const ink = v['--dark-ink']!
    const icon = (k: string) => k === 'web' ? GLOBE(ink) : k === 'mail' ? MAIL(ink) : ARROW(ink)
    this.page({ cls: 'bback', bid: 'back', bg, dark: true, num: false, tall: true, body: `<div class="top"><img class="logo" src="${this.logo('logo-white.svg')}" alt="${this.B.name}">${BACK.about ? `<div class="about">${esc(BACK.about)}</div>` : ''}</div>`
      + `<div class="bot"><div><div class="offices">${BACK.offices.map(o => `<div class="office"><div class="on">${esc(o.name).replace(/ - (Sede .*)$/, ' - <small>$1</small>')}</div><div class="oa">${o.lines.map(esc).join('<br>')}</div></div>`).join('')}</div>`
      + `<div class="links">${BACK.links.map(l => `<div class="lk"><div class="li2">${icon(l.icon)}</div><div class="ll">${esc(l.label)}</div></div>`).join('')}</div></div>`
      + `<div class="ring"><img src="${this.logo('logo-mark-white.svg')}" alt=""></div></div>` })
  }

  html(): string {
    const d = this.doc
    // numeri di pagina per l'indice: copertina, indice, poi apertura + una pagina per sezione
    let k = 1 + (d.toc?.show !== false && d.chapters.length ? 1 : 0)
    for (const ch of d.chapters) { k++; for (const s of ch.sections) this.pageOf.set(s.id, ++k) }
    this.cover()
    this.toc()
    for (const ch of d.chapters) {
      this.opener(ch)
      for (const s of ch.sections) this.section(s, ch)
    }
    this.back()
    const hl = this.B.id === 'civiqa' ? this.B.vars['--b700']! : '#FF00FF'
    const style = applyBrand(css.replace('@BLEED@', this.mode === 'print' ? 'bleed: 3mm;' : '').replace('@PIXGREY@', pixGrey()).replace('@PIXSIDE@', pixSide()), this.B, this.base)
      .split('var(--hl)').join(hl)
    return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(d.meta.title || d.cover.title)} — ${this.B.name}</title>`
      + `<style>${style}</style></head><body>${this.pages.join('')}</body></html>`
  }
}

const hexRgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}` }

export const buildBrochure = (doc: Doc, mode: 'digital' | 'print', imgs: ImgMap, base: string) => new Brochure(doc, mode, imgs, base).html()

/** Immagini che servono alla brochure, con la misura in mm. */
export function brochureNeeds(doc: Doc): { ref: ImageRef; w: number; h: number; whole?: boolean }[] {
  const out: { ref: ImageRef; w: number; h: number; whole?: boolean }[] = []
  const whole = (asset: string, w: number) => out.push({ ref: { asset, cx: 0, cy: 0, zoom: 0 }, w, h: 0, whole: true })
  if (doc.cover.image) out.push({ ref: doc.cover.image, w: PWB, h: PHB })
  if (doc.back?.image) out.push({ ref: doc.back.image, w: PWB, h: PHB })
  for (const ch of doc.chapters) {
    if (ch.image) out.push({ ref: ch.image, w: PWB, h: PHB })
    for (const s of ch.sections) {
      const page = s.layout.page ?? 'testo'
      if (s.layout.band && page === 'colore') out.push({ ref: s.layout.band, w: PWB, h: PHB })
      if (s.layout.band && page === 'prodotto') {
        if ((s.layout.circleFit ?? 'ritaglia') === 'sopra') whole(s.layout.band.asset, 155.6)
        else out.push({ ref: s.layout.band, w: CIRCLE, h: CIRCLE })
      }
      for (const b of s.blocks) {
        if (b.type === 'image' && b.image && page === 'numeri') whole(b.image.asset, 277.6)
        if (b.type === 'table' && (page === 'card')) for (const ic of b.icons || []) if (ic) whole(ic, 6.4)
      }
    }
  }
  return out
}
