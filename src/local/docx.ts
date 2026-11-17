/* Import del Word (.docx) nel browser: stesse regole di backend/app/importer.py.
   Il .docx è uno zip: si leggono word/document.xml, word/styles.xml e le immagini in word/media. */
import JSZip from 'jszip'
import { nid } from '../api'
import type { Block, Chapter, Doc, Kind, Section, View } from '../types'
import { compose, numLike } from './regista'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const kids = (el: Element, ns: string, name: string) => Array.from(el.children).filter(c => c.namespaceURI === ns && c.localName === name)
const kid = (el: Element | undefined | null, name: string) => (el ? kids(el, W, name)[0] : undefined)
const wattr = (el: Element | undefined, name: string) => el?.getAttributeNS(W, name) ?? el?.getAttribute('w:' + name) ?? null

export interface ImportReport { paragrafi: number; tabelle: number; immagini: number; capitoli: number; sezioni: number; scartate: string[] }

function headingLevel(style: string): number | null {
  const s = style.toLowerCase().trim()
  if (s === 'title' || s === 'titolo') return 0
  const m = s.match(/^(heading|titolo)\s*(\d)$/)
  return m ? Number(m[2]) : null
}

function guessView(rows: string[][], caption: string): View {
  const c = caption.toLowerCase()
  if (c.includes('timeline') || c.includes('storia')) return 'timeline'
  const two = rows.filter(r => r.length >= 2)
  if (!two.length || (rows[0]?.length ?? 0) > 2) return 'tabella'
  const first = two.map(r => r[0]!.trim()).filter(Boolean)
  if (first.every(x => /^(19|20)\d\d$/.test(x))) return 'timeline'
  if (first.every(x => numLike(x) && x.length <= 14)) return 'kpi'
  if (first.every(x => /^[A-Z0-9/ .:-]{2,24}$/.test(x))) return 'codici'
  if (first.every(x => x.length <= 40)) return 'valori'
  return 'tabella'
}

export async function importDocx(file: Blob, saveImage: (b: Blob, name: string) => Promise<string>, defaults?: { cover?: string; chapters?: string[] }, kind: Kind = 'bilancio'): Promise<{ doc: Doc; report: ImportReport }> {
  const zip = await JSZip.loadAsync(file)
  const xml = async (p: string) => { const f = zip.file(p); return f ? new DOMParser().parseFromString(await f.async('text'), 'application/xml') : null }
  const docXml = await xml('word/document.xml')
  if (!docXml) throw new Error('Il file non sembra un Word .docx')
  // stili: id -> nome (es. "Titolo1" -> "heading 1"), con eredità basedOn per gli elenchi
  const styles = new Map<string, { name: string; numbered: boolean }>()
  const st = await xml('word/styles.xml')
  st?.querySelectorAll('style').forEach(s => {
    const id = wattr(s, 'styleId') ?? ''
    const name = wattr(kid(s, 'name'), 'val') ?? id
    const numbered = !!kid(kid(s, 'pPr'), 'numPr')
    styles.set(id, { name, numbered })
  })
  // relazioni (immagini)
  const rels = new Map<string, string>()
  ;(await xml('word/_rels/document.xml.rels'))?.querySelectorAll('Relationship').forEach(r => rels.set(r.getAttribute('Id')!, r.getAttribute('Target')!))

  const body = docXml.getElementsByTagNameNS(W, 'body')[0]!
  type Item = { k: 'p'; style: string; text: string; html: string; list: boolean; bold: boolean } | { k: 'img'; id: string } | { k: 'tbl'; rows: string[][] }
  const items: Item[] = []

  const paraText = (p: Element) => {
    let text = '', html = ''
    const parts: { t: string; b: boolean }[] = []
    for (const r of Array.from(p.getElementsByTagNameNS(W, 'r'))) {
      const rPr = kid(r, 'rPr')
      const bEl = kid(rPr, 'b')
      const b = !!bEl && !['0', 'false'].includes(wattr(bEl, 'val') ?? 'true')
      let t = ''
      for (const c of Array.from(r.children)) {
        if (c.localName === 't') t += c.textContent ?? ''
        else if (c.localName === 'tab') t += ' '
        else if (c.localName === 'br' || c.localName === 'cr') t += '\n'
      }
      if (!t) continue
      text += t
      const last = parts[parts.length - 1]
      if (last && last.b === b) last.t += t; else parts.push({ t, b })
    }
    html = parts.map(x => (x.b && x.t.trim() ? `<strong>${esc(x.t)}</strong>` : esc(x.t))).join('').replace(/\n/g, '<br>').trim()
    const filled = parts.filter(x => x.t.trim())
    return { text, html, bold: filled.length > 0 && filled.every(x => x.b) }
  }

  for (const el of Array.from(body.children)) {
    if (el.localName === 'p') {
      for (const blip of Array.from(el.getElementsByTagNameNS(A, 'blip'))) {
        const rid = blip.getAttributeNS(R, 'embed') ?? blip.getAttribute('r:embed')
        const target = rid ? rels.get(rid) : null
        const f = target ? zip.file('word/' + target.replace(/^\/?word\//, '')) : null
        if (f && /\.(png|jpe?g|gif|webp)$/i.test(target!)) {
          const ext = target!.split('.').pop()!.toLowerCase()
          const blob = new Blob([await f.async('arraybuffer')], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
          items.push({ k: 'img', id: await saveImage(blob, 'Immagine dal Word') })
        }
      }
      const { text, html, bold } = paraText(el)
      if (!text.trim()) continue
      const pPr = kid(el, 'pPr')
      const sid = wattr(kid(pPr, 'pStyle'), 'val') ?? 'Normal'
      const sty = styles.get(sid) ?? { name: sid, numbered: false }
      const list = !!kid(pPr, 'numPr') || sty.numbered || /list|elenco/i.test(sty.name)
      items.push({ k: 'p', style: sty.name, text, html, list, bold })
    } else if (el.localName === 'tbl') {
      const rows: string[][] = []
      for (const tr of kids(el, W, 'tr')) {
        const cells: string[] = []
        for (const tc of kids(tr, W, 'tc')) {
          const vm = kid(kid(tc, 'tcPr'), 'vMerge')
          if (vm && wattr(vm, 'val') !== 'restart') { cells.push(''); continue }
          cells.push(kids(tc, W, 'p').map(p => paraText(p).text).join('\n').trim())
        }
        rows.push(cells)
      }
      items.push({ k: 'tbl', rows })
    }
  }

  // Word scritti senza stili di titolo: si riconoscono i titoli dalla forma
  // («Capitolo 2», «2. Ambiente», «2.1 Energia», righe brevi tutte in grassetto o in maiuscolo)
  {
    const styled = [...new Set(items.flatMap(i => (i.k === 'p' && headingLevel(i.style) ? [headingLevel(i.style)!] : [])))].sort()
    if (styled.length < 2) {
      const short = (t: string) => t.length >= 3 && t.length <= 90 && !/[.;,:]$/.test(t)
      const numbered2 = items.some(i => i.k === 'p' && short(i.text.trim()) && /^\d{1,2}\.\d{1,2}\.?\s+\S/.test(i.text.trim()))
      const base = styled.length === 1 ? styled[0]! : 1
      const found: { it: Extract<Item, { k: 'p' }>; lv: number; t: string }[] = []
      for (const it of items) {
        if (it.k !== 'p' || headingLevel(it.style) !== null || it.list) continue
        const t = it.text.trim()
        if (!short(t)) continue
        const caps = t === t.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(t)
        let lv = 0
        if (/^\d{1,2}\.\d{1,2}\.\d{1,2}\.?\s+\S/.test(t)) lv = 3
        else if (/^\d{1,2}\.\d{1,2}\.?\s+\S/.test(t)) lv = 2
        else if (/^(capitolo|parte)\s+\S/i.test(t) || (/^\d{1,2}[.)]?\s+\S/.test(t) && (it.bold || caps)) || (caps && it.bold)) lv = 1
        else if (it.bold) lv = numbered2 ? 3 : 2
        if (lv) found.push({ it, lv, t })
      }
      // prima del primo capitolo c'è la copertina: la prima riga in grassetto è il titolo
      const firstChap = found.findIndex(f => f.lv === 1)
      const hasTitle = items.some(i => i.k === 'p' && headingLevel(i.style) === 0)
      found.forEach((f, k) => {
        if (styled.length === 0 && firstChap > 0 && k < firstChap) {
          if (!hasTitle && k === 0 && items.indexOf(f.it) === items.findIndex(i => i.k === 'p')) f.it.style = 'title'
          return
        }
        let lv = f.lv
        if (styled.length === 1) { if (lv === 1) return; lv = base + lv - 1 }
        f.it.style = `heading ${lv}`
        const t1 = f.t.replace(/^(?:(?:capitolo|parte)\s+\S+\s*[–—:.-]?|\d{1,2}(?:\.\d{1,2}){0,2}[.)]?)\s+/i, '') || f.t
        f.it.text = t1 === t1.toUpperCase() && /[A-ZÀ-Ý]{3}/.test(t1) ? t1.charAt(0) + t1.slice(1).toLowerCase() : t1
      })
    }
  }

  const levels = [...new Set(items.flatMap(i => (i.k === 'p' && headingLevel(i.style) ? [headingLevel(i.style)!] : [])))].sort()
  const chapLv = levels.length >= 2 ? levels[0] : null
  const secLv = levels.length >= 2 ? levels[1] : levels[0] ?? null
  // brochure: il livello sotto la sezione, se arriva subito dopo il titolo di sezione, è il titolo grande della pagina
  // e il titolo di sezione diventa l'etichetta della chip (es. «Il contesto» + «Troppe incognite, pochi strumenti»)
  const subLv = levels.length >= 3 ? levels[2] : null

  const doc: Doc = {
    meta: { title: '', format: 'a4v' },
    cover: { id: 'cover', title: '', subtitle: '', image: null },
    toc: { show: true, title: 'Sommario' },
    chapters: [],
    back: { show: true },
  }
  const report: ImportReport = { paragrafi: 0, tabelle: 0, immagini: 0, capitoli: 0, sezioni: 0, scartate: [] }
  let ch: Chapter | null = null, sec: Section | null = null
  const coverLines: string[] = []
  const newSec = (title: string): Section => ({ id: nid(), title, layout: { cols: 2, mode: 'normal', band: null, tight: 0, ornament: null }, blocks: [] })
  const ensure = (): Section => {
    if (!ch) { ch = { id: nid(), title: doc.cover.title || 'Capitolo', image: null, sections: [] }; doc.chapters.push(ch) }
    if (!sec) { sec = newSec(''); ch.sections.push(sec) }
    return sec
  }
  const push = (b: Block) => ensure().blocks.push(b)

  for (const it of items) {
    if (it.k === 'img') { push({ id: nid(), type: 'image', image: { asset: it.id, cx: 0.5, cy: 0.5, zoom: 1 }, caption: '', ratio: 0.5625 }); report.immagini++; continue }
    if (it.k === 'tbl') {
      let rows = it.rows, caption = '', header = true, view: View = 'tabella'
      if (rows.length > 1 && rows[0]!.length === 1) {
        caption = rows[0]![0]!.replace(/^\s*box grafico\s*[–—-]?\s*/i, '').trim()
        rows = rows.slice(1); header = false
        view = guessView(rows, caption)
        caption = caption.replace(/\s*\((timeline|grafico)\)\s*$/i, '')
        if (['grafico', 'schema grafico'].includes(caption.toLowerCase())) caption = ''
      }
      else if (rows.length >= 2 && Math.max(...rows.map(r => r.length)) <= 3) {
        // tabella senza riga di didascalia: se è una serie di numeri o di anni la mostro come tale
        const headLike = !/\d/.test(rows[0]![0] ?? '') && rows.slice(1).every(r => /\d/.test(r[0] ?? ''))
        const v = guessView(rows.slice(headLike ? 1 : 0), '')
        if (v === 'kpi' || v === 'timeline') { view = v; header = headLike }
      }
      push({ id: nid(), type: 'table', view, header, caption, rows, icons: [] })
      report.tabelle++
      continue
    }
    const txt = it.text.trim()
    const lv = headingLevel(it.style)
    if (lv === 0) { doc.cover.title = txt; doc.meta.title = txt; continue }
    if (!doc.chapters.length && lv === null) { coverLines.push(txt); continue }
    if (lv !== null && lv === chapLv) { ch = { id: nid(), title: txt, image: null, sections: [] }; doc.chapters.push(ch); sec = null; report.capitoli++; continue }
    if (lv !== null && lv === secLv) {
      if (!ch) { ch = { id: nid(), title: doc.cover.title || 'Capitolo', image: null, sections: [] }; doc.chapters.push(ch) }
      sec = newSec(txt); ch.sections.push(sec); report.sezioni++; continue
    }
    if (kind === 'brochure' && lv !== null && lv === subLv && sec && !sec.blocks.length && !sec.kicker) {
      // solo se nella sezione non ci sono altri titoletti dello stesso livello (altrimenti sono voci: Analisi, Strategia…)
      const i0 = items.indexOf(it)
      let more = false
      for (let j = i0 + 1; j < items.length; j++) {
        const x = items[j]!
        if (x.k !== 'p') continue
        const l2 = headingLevel(x.style)
        if (l2 !== null && l2 <= (secLv ?? 0)) break
        if (l2 === subLv) { more = true; break }
      }
      if (!more) { sec.kicker = sec.title; sec.title = txt; continue }
    }
    const ph = txt.match(/^\[?\s*(?:foto|immagine|image|img)\s*[:–-]\s*(.+?)\s*\]?$/i)
    if (ph && txt.length < 140) { push({ id: nid(), type: 'image', image: null, caption: '', ratio: 0.5625, hint: ph[1]! }); continue }
    const bullet = /^[•\-–—*·▪◦►✓]\s+/
    if (lv !== null || (/^[A-Z]{1,3}\d{1,3}\s+\S/.test(txt) && txt.length < 90 && !txt.endsWith('.')) || (it.bold && !it.list && txt.length <= 90 && !/[.;,:]$/.test(txt) && !bullet.test(txt))) push({ id: nid(), type: 'h4', html: esc(txt) })
    else if (/^citazione in evidenza\s*:/i.test(txt) || /quote|citazione/i.test(it.style) || /^[«"“][^«»"“”]{15,400}[»"”](\s*[–—-]\s*.{2,60})?$/.test(txt)) push({ id: nid(), type: 'quote', html: esc(txt.replace(/^citazione in evidenza\s*:\s*/i, '')) })
    else if (it.list) push({ id: nid(), type: 'li', html: it.html })
    else if (bullet.test(txt)) push({ id: nid(), type: 'li', html: it.html.replace(/^(<strong>)?[•\-–—*·▪◦►✓]\s+/, '$1') })
    else push({ id: nid(), type: 'p', html: it.html })
    report.paragrafi++
  }

  for (const line of coverLines) {
    if (['sommario', 'indice', 'indice dei contenuti'].includes(line.toLowerCase())) doc.toc.title = line
    else if (!doc.cover.subtitle) doc.cover.subtitle = line
    else report.scartate.push(line)
  }
  if (!doc.cover.title && doc.chapters.length) { doc.cover.title = doc.chapters[0]!.title; doc.meta.title = doc.cover.title }

  if (kind === 'brochure') {
    doc.meta.kind = 'brochure'
    doc.meta.format = 'br'
    doc.toc.title = 'Indice'
    for (const c of doc.chapters) for (const s of c.sections) {
      for (const b of s.blocks) {
        if (b.type !== 'table') continue
        // nella brochure le tabelle sono elenchi di voci (titolo · testo) o di numeri, senza riga d'intestazione
        const rows = b.rows.filter(r => r.some(x => x.trim()))
        const firstNum = rows.length >= 2 && rows.every(r => numLike(r[0] ?? '') && (r[0] ?? '').trim().length <= 12)
        const headLike = rows.length > 2 && !/\d/.test(rows[0]![0] ?? '') && firstNum === false && rows[0]!.every(x => x.length <= 24) && rows.slice(1).some(r => r.some(x => x.length > 40))
        if (b.view === 'tabella') { b.header = headLike; if (rows.slice(headLike ? 1 : 0).every(r => numLike(r[0] ?? '') && (r[0] ?? '').trim().length <= 12)) b.view = 'kpi' }
      }
    }
    for (const c of doc.chapters) c.sections = c.sections.filter(x => x.title || x.blocks.length)
    compose(doc)
    return { doc, report }
  }

  for (const c of doc.chapters) c.sections = c.sections.filter(x => x.title || x.blocks.length)
  compose(doc)
  if (defaults?.cover) doc.cover.image = { asset: defaults.cover, cx: 0.5, cy: 0.5, zoom: 1 }
  if (defaults?.chapters?.length) doc.chapters.forEach((c, i) => { c.image = { asset: defaults.chapters![i % defaults.chapters!.length]!, cx: 0.5, cy: 0.5, zoom: 1 } })
  return { doc, report }
}
