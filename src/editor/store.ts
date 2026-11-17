import { nid } from '../api'
import type { Block, Chapter, Doc, Section, TextType, View } from '../types'

export type Sel =
  | { kind: 'cover' }
  | { kind: 'chapter'; id: string }
  | { kind: 'section'; id: string }
  | { kind: 'block'; id: string }
  | null

export interface Where { ch: Chapter; ci: number; sec?: Section; si?: number; block?: Block; bi?: number }

/** Trova capitolo, sezione e blocco di un id qualsiasi. */
export function locate(doc: Doc, id: string): Where | null {
  for (let ci = 0; ci < doc.chapters.length; ci++) {
    const ch = doc.chapters[ci]!
    if (ch.id === id) return { ch, ci }
    for (let si = 0; si < ch.sections.length; si++) {
      const sec = ch.sections[si]!
      if (sec.id === id) return { ch, ci, sec, si }
      const bi = sec.blocks.findIndex(b => b.id === id)
      if (bi >= 0) return { ch, ci, sec, si, block: sec.blocks[bi], bi }
    }
  }
  return null
}

/** Selezione corrispondente a un id cliccato nell'anteprima. */
export function selFromId(doc: Doc, id: string): Sel {
  if (id === 'cover' || id === doc.cover.id || id === 'toc' || id === 'back') return { kind: 'cover' }
  const w = locate(doc, id)
  if (!w) return null
  if (w.block) return { kind: 'block', id }
  if (w.sec) return { kind: 'section', id }
  return { kind: 'chapter', id }
}

export const clone = <T,>(x: T): T => structuredClone(x)

export const TEXT_TYPES: { v: TextType; l: string }[] = [
  { v: 'p', l: 'Paragrafo' }, { v: 'h4', l: 'Sottotitolo' }, { v: 'li', l: 'Elenco' },
  { v: 'quote', l: 'Citazione' }, { v: 'note', l: 'Nota' }, { v: 'sign', l: 'Firma' },
]
export const VIEWS: { v: View; l: string; cols: string; help: string }[] = [
  { v: 'tabella', l: 'Tabella', cols: 'Prima riga = intestazione', help: 'Dati in righe e colonne.' },
  { v: 'kpi', l: 'Numeri chiave', cols: 'Valore · Descrizione', help: 'Numeri grandi in serif con la descrizione sotto.' },
  { v: 'timeline', l: 'Linea del tempo', cols: 'Anno · Testo', help: 'Tappe in ordine; «Titolo: descrizione» va su due righe.' },
  { v: 'valori', l: 'Voci e testo', cols: 'Voce · Descrizione', help: 'Voce grande a sinistra, testo a destra.' },
  { v: 'elenco', l: 'Elenco a riquadri', cols: 'Titolo (facoltativo) · Testo', help: 'Riquadri in griglia con numero o icona del DS.' },
  { v: 'barre', l: 'Barre', cols: 'Etichetta · Valore', help: 'Barre orizzontali in Bluette, proporzionali ai valori.' },
  { v: 'segmenti', l: 'Composizione', cols: 'Etichetta · Valore', help: 'Una barra divisa in parti con legenda (es. percentuali).' },
  { v: 'codici', l: 'Codici', cols: 'Codice · Descrizione', help: 'Griglia di codici (certificazioni, norme, GRI).' },
]

export function newBlock(type: Block['type'] | TextType): Block {
  if (type === 'table') return { id: nid(), type: 'table', view: 'tabella', header: true, caption: '', rows: [['Colonna 1', 'Colonna 2'], ['', '']], icons: [] }
  if (type === 'image') return { id: nid(), type: 'image', image: null, caption: '', ratio: 0.5625 }
  return { id: nid(), type: type as TextType, html: '' }
}
export function newSection(title = 'Nuova sezione'): Section {
  return { id: nid(), title, layout: { cols: 2, mode: 'normal', band: null, tight: 0, ornament: null }, blocks: [newBlock('p')] }
}
export function newChapter(title = 'Nuovo capitolo'): Chapter {
  return { id: nid(), title, image: null, sections: [newSection()] }
}

export function blockLabel(b: Block): string {
  if (b.type === 'table') return VIEWS.find(v => v.v === b.view)?.l ?? 'Tabella'
  if (b.type === 'image') return 'Immagine'
  return TEXT_TYPES.find(t => t.v === b.type)?.l ?? 'Testo'
}
export function blockExcerpt(b: Block, n = 70): string {
  let s = ''
  if (b.type === 'table') s = b.caption || (b.rows[0] ?? []).join(' · ')
  else if (b.type === 'image') s = b.caption || 'Immagine'
  else s = b.html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** Sposta un elemento in un array (in place). */
export function move<T>(arr: T[], i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= arr.length) return
  const [x] = arr.splice(i, 1)
  arr.splice(j, 0, x!)
}
