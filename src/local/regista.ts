/* Il «regista»: decide come impaginare le pagine interne partendo dal contenuto del Word.
   Punti fermi (non li tocca): copertina e aperture con foto, indice, tipografia, colori del brand, marchio e numeri di pagina.
   Tutto il resto lo sceglie da un repertorio di modalità, sezione per sezione, seguendo regole di ritmo:
   - mai la stessa modalità tre volte di fila, possibilmente nemmeno due;
   - dopo circa due pagine fitte serve una pagina che respira (numeri, dato in grande, citazione, card);
   - le pagine scure non si toccano mai; le foto in fondo alle sezioni si distribuiscono lungo il documento.
   Bilancio: modalità per sezione (Layout.look). Brochure: ogni sezione diventa una o più pagine, e il testo
   che non ci sta va nella pagina successiva invece di essere tagliato.
   Le sezioni impostate a mano (layout.auto === false) restano come sono. Con seed > 0 propone varianti. */
import { nid } from '../api'
import type { Block, Doc, Look, PageType, Section, TableBlock, TextBlock } from '../types'
import { cardRun, FORMATS, plain } from './engine'

const len = (b: Block) => ('html' in b ? plain(b.html).length : 0)
const isText = (b: Block): b is TextBlock => b.type !== 'table' && b.type !== 'image'

/** generatore pseudo-casuale con seme: stesso seme, stessa impaginazione */
function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1
  return () => { a ^= a << 13; a >>>= 0; a ^= a >> 17; a ^= a << 5; a >>>= 0; return (a % 10000) / 10000 }
}

/* ================================================================== numeri nel testo */
const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`
const UNIT = String.raw`(?:per\s?cento|milioni|miliardi|mila|mln|mld|tonnellate|tCO2e?|kg|MWh|kWh|GWh|TWh|GJ|ore|dipendenti|persone|collaboratori|lavoratori|ettari|km|progetti|clienti|soci|aziende|imprese|comuni|studi|fornitori|partecipanti|beneficiari|studenti|volontari)`
const RE_NUM = new RegExp(String.raw`(?:€\s?)?(?:${NUM})\s?%|(?:€\s?)?(?:${NUM})\s(?:di\s)?${UNIT}\b(?:\s(?:di\s)?(?:euro|€))?|€\s?(?:${NUM})(?:\s(?:milioni|miliardi|mila|mln|mld))?|(?:${NUM})\s?(?:€|euro\b)`, 'i')

/** Il numero più adatto a stare in grande in apertura di sezione, con la frase che lo contiene (dal testo, senza inventare). */
export function findHero(s: Section): { n: string; l: string } | null {
  let best: { n: string; l: string; sc: number } | null = null
  s.blocks.forEach((b, i) => {
    if (b.type !== 'p' && b.type !== 'li') return
    const sentences = plain(b.html).split(/(?<=[.!?;])\s+(?=[A-ZÀ-Ý«"“0-9])/)
    for (const t of sentences) {
      const m = t.match(RE_NUM)
      if (!m) continue
      const n = m[0].replace(/\s?per\s?cento/i, '%').trim()
      if (n.length > 16 || t.length < 25 || t.length > 190) continue
      const sc = (/%|€|euro/i.test(n) ? 2 : 1) - i * 0.15 - Math.abs(t.length - 110) / 200
      if (!best || sc > best.sc) best = { n, l: t.replace(/[;:]$/, '.'), sc }
    }
  })
  return best ? { n: (best as { n: string }).n, l: (best as { l: string }).l } : null
}

/* ================================================================== bilancio */
interface Feat { chars: number; nP: number; tables: number; kpi: TableBlock | null; wide: boolean; quote: boolean; card: boolean; hero: { n: string; l: string } | null; pages: number; imgs: number }

/** Una tabella che sta bene come numeri grandi: 2-3 colonne, 2-6 righe, prima colonna numerica e breve. */
/** valore numerico breve: «48,6 mln €», «92%», «300+», «€ 12 mld» (non «Progetto 1») */
export const numLike = (v: string) => /^[€$~<>≈+-]?\s?\d[\d.,]*\s?(%|\+|[a-zA-Z€]{1,4}(\s?€)?)?$/.test(v.trim())
const kpiLike = (t: TableBlock) => {
  const rows = t.rows.filter(r => r.some(c => c.trim())).slice(t.header && t.view === 'tabella' ? 1 : 0)
  if (t.view === 'timeline' || (rows.length && rows.every(r => /^(19|20)\d\d$/.test((r[0] ?? '').trim())))) return false
  return t.view === 'kpi' || (rows.length >= 2 && rows.length <= 6 && rows.every(r => r.length >= 2 && r.length <= 3 && numLike(r[0] ?? '') && (r[0] ?? '').trim().length <= 14))
}

function features(s: Section, fmt: string): Feat {
  const F = FORMATS[fmt as 'a4v' | 'a4o'] ?? FORMATS.a4v
  const tables = s.blocks.filter((b): b is TableBlock => b.type === 'table')
  const chars = s.blocks.reduce((n, b) => n + (isText(b) ? len(b) : 0), 0)
  const nP = s.blocks.filter(b => b.type === 'p' || b.type === 'li').length
  const kpis = tables.filter(kpiLike)
  const wide = tables.some(t => t.view === 'tabella' && !kpiLike(t) && (Math.max(...t.rows.map(r => r.length)) >= 4 || t.rows.length > 10))
  const imgs = s.blocks.filter(b => b.type === 'image').length
  // pagine stimate: ~5000 caratteri per pagina di testo, righe di tabella da 6 mm, box da 55 mm, immagini da 100 mm
  const rows = tables.filter(t => t.view === 'tabella').reduce((n, t) => n + t.rows.length, 0)
  const boxes = tables.filter(t => t.view !== 'tabella').length
  const pages = chars / 5000 + (rows * 6 + boxes * 55 + imgs * 100 + 30) / (F.PH - F.MT - F.MB)
  return {
    chars, nP, wide, imgs, pages, tables: tables.length,
    kpi: tables.length === 1 && kpis.length === 1 ? kpis[0]! : null,
    quote: s.blocks.some(b => b.type === 'quote' && len(b) <= 320),
    card: !!cardRun(s.blocks),
    hero: findHero(s),
  }
}

const BREATH: Look[] = ['numeri', 'dato', 'citazione', 'card']

function candidates(f: Feat): { look: Look; fit: number }[] {
  if (f.wide && f.nP <= 3) return [{ look: 'largo', fit: 1 }]
  const out: { look: Look; fit: number }[] = []
  if (f.kpi && f.chars < 700 && !f.imgs) out.push({ look: 'numeri', fit: 0.95 })
  if (f.card) out.push({ look: 'card', fit: 0.75 })
  if (f.quote) out.push({ look: 'citazione', fit: 0.56 })
  if (f.hero && !f.kpi && f.nP >= 3 && f.tables <= 2) out.push({ look: 'dato', fit: 0.55 + (f.chars > 1200 ? 0.1 : 0) })
  if (f.chars < 2600 && !f.wide) out.push({ look: 'margine', fit: 0.5 })
  out.push({ look: 'colonne', fit: f.chars >= 1800 ? 0.62 : 0.38 })
  if (f.wide) out.push({ look: 'largo', fit: 0.55 })
  return out
}

/** Modalità di una sezione impostata prima del regista (documenti vecchi o scelte a mano). */
export function lookOf(s: Section): Look {
  const L = s.layout
  if (L.look) return L.look
  if (L.mode === 'highlights') return 'numeri'
  return L.cols === 1 ? 'margine' : L.cols === 'w' ? 'largo' : 'colonne'
}

/** Applica una modalità alla sezione: colonne, pagina viola, numero in evidenza. */
export function setLook(s: Section, look: Look, fmt: string, manual = false) {
  const f = features(s, fmt)
  const L = s.layout
  L.look = look
  L.mode = look === 'numeri' ? 'highlights' : 'normal'
  L.cols = look === 'margine' || look === 'citazione' ? 1 : look === 'largo' ? 'w' : look === 'dato' ? (f.chars > 2200 ? 2 : 1) : 2
  if (look === 'dato') L.hero = L.hero?.n ? L.hero : f.hero ?? { n: '', l: '' }
  if (look === 'numeri') for (const b of s.blocks) if (b.type === 'table' && kpiLike(b)) { b.view = 'kpi'; break }
  if (manual) L.auto = false
}

function composeBilancio(doc: Doc, seed: number) {
  const r = rng(seed)
  for (const ch of doc.chapters) {
    const hist: Look[] = []
    let dense = 0
    ch.sections.forEach((s, si) => {
      const f = features(s, doc.meta.format)
      let look: Look
      if (s.layout.auto === false) look = lookOf(s)
      else {
        let best: { look: Look; sc: number } | null = null
        for (const c of candidates(f)) {
          let sc = c.fit
          if (hist[hist.length - 1] === c.look) sc -= hist[hist.length - 2] === c.look ? 1 : 0.35
          if (BREATH.includes(c.look)) sc += dense >= 1.8 ? 0.45 : dense >= 0.9 ? 0.2 : c.look === 'dato' ? 0 : -0.1
          if (c.look === 'numeri' && hist[hist.length - 1] === 'numeri') sc -= 1
          if (c.look === 'numeri' && si === 0) sc -= 0.15
          if (seed) sc += (r() - 0.5) * 0.5
          if (!best || sc > best.sc) best = { look: c.look, sc }
        }
        look = best!.look
        setLook(s, look, doc.meta.format)
        s.layout.auto = true
      }
      hist.push(look)
      dense = look === 'numeri' ? 0 : BREATH.includes(look) ? f.pages * 0.5 : dense + f.pages
    })
  }
  // foto in fondo alle sezioni: posti buoni distanziati (almeno ~3 pagine tra una e l'altra, mai subito dopo l'apertura)
  for (const ch of doc.chapters) {
    let since = 1
    ch.sections.forEach((s, si) => {
      const f = features(s, doc.meta.format)
      const look = lookOf(s)
      const ok = si > 0 && ['colonne', 'margine', 'dato'].includes(look) && f.pages >= 0.6 && since >= 2.5
      s.layout.bandSlot = ok
      since = ok ? 0 : since + f.pages
    })
  }
}

/* ================================================================== brochure */
/* Capienza delle pagine (pagina 303 × 177 mm, riquadro 277,6 × 142,3 mm), stimata in caratteri:
   testo su due colonne ~1.700 caratteri con il titolo, ~2.200 senza; pagina colore ~680;
   card: 2-4 riquadri affiancati; griglia: fino a 8 voci brevi su 4 colonne. */
const CAP = { text: 1700, textCont: 2200, colore: 680, card: { 2: 950, 3: 680, 4: 500 } as Record<number, number>, grid4: 290, grid3: 400, items: 600 }

type Unit = { k: 'text'; blocks: Block[] } | { k: 'items'; groups: Block[][] } | { k: 'quote'; b: Block } | { k: 'kpi'; b: TableBlock } | { k: 'table'; b: TableBlock }
interface PagePlan { blocks: Block[]; opts: { page: PageType; fit: number }[]; image?: boolean; product?: boolean }

const gLen = (g: Block[]) => g.reduce((n, b) => n + (b.type === 'table' ? b.rows.flat().join(' ').length : len(b)), 0)

/** Divide un paragrafo troppo lungo in due, a fine frase (il testo resta identico). */
function splitPara(b: TextBlock, max: number): TextBlock[] {
  const parts = b.html.split(/(?<=[.!?;])\s+(?=[A-ZÀ-Ý«"“<])/)
  if (parts.length < 2) return [b]
  const out: TextBlock[] = []
  let cur = ''
  for (const p of parts) {
    if (cur && plain(cur + ' ' + p).length > max) { out.push({ ...b, id: out.length ? nid() : b.id, html: cur }); cur = p } else cur = cur ? `${cur} ${p}` : p
  }
  if (cur) out.push({ ...b, id: out.length ? nid() : b.id, html: cur })
  return out
}

/** Spezza una tabella in più tabelle da `per` righe (la prima tiene il suo id). */
function splitTable(t: TableBlock, per: number): TableBlock[] {
  const head = t.header && t.view === 'tabella' ? [t.rows[0]!] : []
  const body = t.rows.slice(head.length)
  const out: TableBlock[] = []
  for (let i = 0; i < body.length; i += per) out.push({ ...t, id: i ? nid() : t.id, rows: [...head, ...body.slice(i, i + per)], icons: (t.icons || []).slice(i, i + per), caption: i ? '' : t.caption })
  return out
}

/** Divide il contenuto di una sezione in unità: testo, voci (sottotitolo + testo), citazioni, numeri, tabelle. */
function unitsOf(s: Section): Unit[] {
  const out: Unit[] = []
  const pushText = (b: Block) => { const u = out[out.length - 1]; if (u?.k === 'text') u.blocks.push(b); else out.push({ k: 'text', blocks: [b] }) }
  for (let i = 0; i < s.blocks.length; i++) {
    const b = s.blocks[i]!
    if (b.type === 'quote' && len(b) <= 200) { out.push({ k: 'quote', b }); continue }
    if (b.type === 'table') { out.push(kpiLike(b) ? { k: 'kpi', b } : { k: 'table', b }); continue }
    if (b.type === 'image') continue
    if (b.type === 'h4') {
      const g: Block[] = [b]
      while (i + 1 < s.blocks.length && ['p', 'li', 'note'].includes(s.blocks[i + 1]!.type)) g.push(s.blocks[++i]!)
      const u = out[out.length - 1]
      if (u?.k === 'items') u.groups.push(g); else out.push({ k: 'items', groups: [g] })
      continue
    }
    pushText(b)
  }
  return out
}

/** Tipi di pagina possibili per un gruppo di voci, con quante voci entrano. */
function itemPages(groups: Block[][], withIntro: boolean): { take: number; opts: { page: PageType; fit: number }[] } {
  const k = withIntro ? 0.75 : 1
  const fits = (n: number, cap: number) => groups.slice(0, n).every(g => gLen(g) <= cap * k)
  const cand: { page: PageType; fit: number; take: number }[] = []
  const n4 = Math.min(groups.length, 4), n6 = Math.min(groups.length, 6), n8 = Math.min(groups.length, 8)
  if (n4 >= 2 && fits(n4, CAP.card[n4]!)) cand.push({ page: 'card', fit: 0.8, take: n4 })
  if (n8 >= 5 && fits(n8, CAP.grid4)) cand.push({ page: 'griglia', fit: 0.85, take: n8 })
  else if (n6 >= 3 && fits(n6, CAP.grid3)) cand.push({ page: 'griglia', fit: 0.6, take: n6 })
  // voci lunghe: pagina di testo con le voci su due colonne (due per pagina se sono lunghe)
  const t = fits(n4, CAP.items * 0.55) ? n4 : fits(Math.min(groups.length, 2), CAP.items) ? Math.min(groups.length, 2) : 1
  cand.push({ page: 'testo', fit: cand.length ? 0.45 : 0.6, take: t })
  // vince l'opzione migliore (a parità, quella che mette più voci); le altre restano possibili se reggono lo stesso numero di voci
  const best = cand.reduce((x, y) => (y.fit + y.take * 0.02 > x.fit + x.take * 0.02 ? y : x))
  return { take: best.take, opts: cand.filter(c => c.take >= best.take).map(c => ({ page: c.page, fit: c.fit })) }
}

/** Le pagine di una sezione della brochure: il contenuto viene diviso in modo che ogni pagina ci stia. */
function planSection(s: Section): PagePlan[] {
  const plans: PagePlan[] = []
  const units = unitsOf(s)
  const hasImage = s.blocks.some(b => b.type === 'image') || !!s.layout.band
  const title = () => plans.length === 0 && !!s.title
  for (let ui = 0; ui < units.length; ui++) {
    const u = units[ui]!
    if (u.k === 'quote') { plans.push({ blocks: [u.b], opts: [{ page: 'citazione', fit: 1 }] }); continue }
    if (u.k === 'kpi') {
      // un testo breve subito prima dei numeri fa da introduzione nella stessa pagina
      const prev = plans[plans.length - 1]
      let intro: Block[] = []
      if (prev && units[ui - 1]?.k === 'text' && prev.blocks.every(isText) && prev.blocks.reduce((n, b) => n + len(b), 0) <= 300) { intro = prev.blocks; plans.pop() }
      // in fila ci stanno i numeri finché la loro larghezza (50 pt) non supera la pagina
      const rows = u.b.rows.filter(r => r.some(c => c.trim())).slice(u.b.header && u.b.view === 'tabella' ? 1 : 0)
      const w = rows.reduce((n, r) => n + Math.max(36, (r[0] ?? '').trim().length * 9.5) + 12, 0)
      const pages = Math.max(Math.ceil(w / 265), Math.ceil(rows.length / 6))
      for (const t of splitTable(u.b, Math.ceil(rows.length / pages))) { plans.push({ blocks: [...intro, t, ...s.blocks.filter(b => b.type === 'image').slice(0, 1)], opts: [{ page: 'numeri', fit: 1 }] }); intro = [] }
      continue
    }
    if (u.k === 'table') {
      const per = u.b.rows.every(r => r.join(' ').length <= 220) ? 8 : 4
      for (const t of splitTable(u.b, per)) {
        const n = t.rows.length - (t.header && t.view === 'tabella' ? 1 : 0)
        plans.push({ blocks: [t], opts: n >= 5 ? [{ page: 'griglia', fit: 0.8 }, { page: 'card', fit: 0.3 }] : [{ page: 'card', fit: 0.8 }, { page: 'griglia', fit: 0.4 }] })
      }
      continue
    }
    if (u.k === 'items' && u.groups.length === 1) {
      // una sola voce non fa una griglia: è testo con un sottotitolo (o lo schema della pagina prodotto)
      const prev = units[ui - 1]
      if (prev?.k === 'text' && plans.length && plans[plans.length - 1]!.blocks.every(isText) && plans[plans.length - 1]!.blocks.reduce((n, b) => n + len(b), 0) + gLen(u.groups[0]!) <= CAP.text) {
        const last = plans.pop()!
        units.splice(ui + 1, 0, { k: 'text', blocks: [...last.blocks, ...u.groups[0]!] })
      } else units.splice(ui + 1, 0, { k: 'text', blocks: u.groups[0]! })
      continue
    }
    if (u.k === 'items') {
      // un testo breve subito prima delle voci fa da introduzione nella stessa pagina
      const prev = plans[plans.length - 1]
      let intro: Block[] = []
      if (prev && prev.opts.some(o => o.page === 'testo' || o.page === 'colore') && prev.blocks.every(isText) && prev.blocks.reduce((n, b) => n + len(b), 0) <= 320 && units[ui - 1]?.k === 'text') {
        intro = prev.blocks; plans.pop()
      }
      let rest = u.groups
      while (rest.length) {
        const { take, opts } = itemPages(rest, intro.length > 0)
        plans.push({ blocks: [...intro, ...rest.slice(0, take).flat()], opts })
        intro = []
        rest = rest.slice(take)
      }
      continue
    }
    // testo: si riempie una pagina alla volta, dividendo i paragrafi lunghi a fine frase
    let page: Block[] = [], used = 0
    const cap = () => (title() || plans.length === 0 ? CAP.text : CAP.textCont) - (s.title.length > 32 && title() ? 150 : 0)
    const close = () => {
      if (!page.length) return
      const chars = page.reduce((n, b) => n + len(b), 0)
      const nli = page.filter(b => b.type === 'li').length
      const opts: { page: PageType; fit: number }[] = [{ page: 'testo', fit: 0.5 }]
      if (chars <= CAP.colore && page.length <= 5) opts.push({ page: 'colore', fit: chars <= 420 ? 0.62 : 0.5 })
      const nh4 = page.filter(b => b.type === 'h4').length
      // schema «prodotto» (come Externalytics e Sonar): un sottotitolo, un testo e 2-4 punti elenco brevi
      const product = nh4 <= 1 && nli >= 2 && nli <= 4 && page.filter(b => b.type === 'li').every(b => len(b) <= 70)
      if ((hasImage || product) && chars <= 900 && nli <= 4) opts.push({ page: 'prodotto', fit: product ? 0.85 : 0.75 })
      plans.push({ blocks: page, opts, product })
      page = []; used = 0
    }
    for (const b0 of u.blocks) {
      for (const b of isText(b0) && len(b0) > cap() * 0.9 ? splitPara(b0, Math.round(cap() * 0.6)) : [b0]) {
        if (used + len(b) > cap() && page.length) close()
        page.push(b); used += len(b) + 60
      }
    }
    close()
  }
  if (!plans.length) plans.push({ blocks: s.blocks.filter(b => b.type !== 'image'), opts: [{ page: 'colore', fit: 0.6 }, { page: 'testo', fit: 0.5 }] })
  // la foto del Word va nella prima pagina che può ospitarla (cerchio della pagina prodotto)
  const imgIdx = plans.findIndex(p => p.opts.some(o => o.page === 'prodotto'))
  if (imgIdx >= 0 && hasImage) plans[imgIdx]!.image = true
  return plans
}

const BG: Record<PageType, string> = { testo: 'w', prodotto: 'w', numeri: 'w', citazione: 'w', card: 'dots', griglia: 'dots', colore: 'dark' }

function composeBrochure(doc: Doc, seed: number) {
  const r = rng(seed)
  for (const ch of doc.chapters) {
    // 1. le pagine di continuazione create in precedenza tornano nella loro sezione, poi si ridivide da capo
    const merged: Section[] = []
    for (const s of ch.sections) {
      const prev = merged[merged.length - 1]
      if (s.cont && s.layout.auto !== false && prev && prev.layout.auto !== false) {
        prev.blocks.push(...s.blocks)
        if (!prev.layout.band && s.layout.band) prev.layout.band = s.layout.band
      } else merged.push(s)
    }
    // 2. pagine pianificate per ogni sezione
    const out: Section[] = []
    const hist: PageType[] = []
    let whites = 0
    for (const s of merged) {
      if (s.layout.auto === false) { out.push(s); hist.push(s.layout.page ?? 'testo'); whites = BG[s.layout.page ?? 'testo'] !== 'dark' ? whites + 1 : 0; continue }
      const imgBlock = s.blocks.find(b => b.type === 'image')
      const plans = planSection(s)
      plans.forEach((p, i) => {
        let best: { page: PageType; sc: number } | null = null
        for (const o of p.opts) {
          let sc = o.fit
          const last = hist[hist.length - 1], last2 = hist[hist.length - 2]
          if (last === o.page) sc -= last2 === o.page ? 1 : 0.4
          if (last && BG[last] === BG[o.page] && BG[o.page] !== 'w') sc -= 0.3
          if (BG[o.page] === 'dark') sc += whites >= 2 ? 0.35 : whites === 0 ? -0.5 : 0
          else if (BG[o.page] === 'dots' && last && BG[last] === 'w' && hist.length >= 2 && BG[hist[hist.length - 2]!] === 'w') sc += 0.15
          if (o.page === 'prodotto' && !p.image && !p.product) sc -= 2
          if (seed) sc += (r() - 0.5) * 0.45
          if (!best || sc > best.sc) best = { page: o.page, sc }
        }
        const page = best!.page
        const sec: Section = i === 0 ? s : { id: nid(), title: '', kicker: s.kicker, cont: true, layout: { ...s.layout, band: null, page, auto: true }, blocks: [] }
        sec.blocks = p.blocks
        sec.layout = { ...sec.layout, page, auto: true }
        if (page === 'prodotto' && imgBlock?.type === 'image' && imgBlock.image && !s.layout.band) { sec.layout.band = imgBlock.image; sec.layout.circleFit = 'sopra' }
        else if (page === 'prodotto' && i > 0 && s.layout.band) { sec.layout.band = s.layout.band; sec.layout.circleFit = s.layout.circleFit; s.layout.band = null }
        if (i === 0 && page !== 'prodotto' && page !== 'colore' && s.layout.band && !plans.some(q => q.image)) { /* la foto resta: servirà se la pagina diventa colore */ }
        // il blocco immagine del Word: resta solo dove serve (loghi della pagina numeri); altrove la foto è nel cerchio
        if (page !== 'numeri') sec.blocks = sec.blocks.filter(b => b.type !== 'image')
        out.push(sec)
        hist.push(page)
        whites = BG[page] !== 'dark' ? whites + 1 : 0
      })
    }
    ch.sections = out
  }
}

/** Impagina il documento: il regista sceglie le modalità (bilancio) o divide e alterna le pagine (brochure). */
export function compose(doc: Doc, seed = 0): Doc {
  if (doc.meta.kind === 'brochure') composeBrochure(doc, seed)
  else composeBilancio(doc, seed)
  return doc
}

/** Brochure: divide le pagine in cui il contenuto non entra (misurate nell'anteprima). Restituisce quante ne ha divise. */
export function splitOverflowing(doc: Doc, ids: string[]): number {
  let n = 0
  for (const ch of doc.chapters) {
    for (let i = 0; i < ch.sections.length; i++) {
      const s = ch.sections[i]!
      if (!ids.includes(s.id)) continue
      let blocks = s.blocks.filter(b => b.type !== 'image')
      const imgs = s.blocks.filter(b => b.type === 'image')
      // una sola tabella o un solo paragrafo: prima si spezza quello
      if (blocks.length === 1) {
        const b = blocks[0]!
        if (b.type === 'table') { const per = Math.ceil((b.rows.length - (b.header && b.view === 'tabella' ? 1 : 0)) / 2); if (per >= 1 && b.rows.length > 1) blocks = splitTable(b, per) }
        else if (isText(b)) blocks = splitPara(b, Math.ceil(len(b) / 2))
      }
      if (blocks.length < 2) {
        // non si può dividere: una pagina più capiente
        if (s.layout.page !== 'testo') { s.layout.page = 'testo'; n++ }
        continue
      }
      // taglio a metà, senza separare un sottotitolo dal suo testo
      let cut = Math.ceil(blocks.length / 2)
      while (cut > 1 && blocks[cut - 1]!.type === 'h4') cut--
      const page = s.layout.page === 'citazione' || s.layout.page === 'numeri' ? s.layout.page : s.layout.page === 'colore' || s.layout.page === 'prodotto' ? 'testo' : s.layout.page
      s.blocks = [...blocks.slice(0, cut), ...imgs]
      const next: Section = { id: nid(), title: '', kicker: s.kicker, cont: true, layout: { ...s.layout, band: null, page: page ?? 'testo' }, blocks: blocks.slice(cut) }
      ch.sections.splice(i + 1, 0, next)
      n++
      i++
    }
  }
  return n
}
