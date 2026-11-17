/* Sistemazione automatica delle foto nel documento.
   Ordine delle regole (la prima che decide vince):
   1. indicazione nel Word: un paragrafo «[Foto: nome-file]» diventa un segnaposto, riempito con quel file
   2. nome del file: «copertina»/«cover» → copertina; parole del titolo di un capitolo o di una sezione → lì
   3. cosa mostra la foto (src/local/photo.ts):
      - con soggetto (es. animale su fondo sfocato) → copertina, poi aperture dei capitoli, in ordine
      - d'ambiente (paesaggi, texture) → foto in fondo alle sezioni, distribuite lungo il documento
      Regola del Report OE: gli animali solo in copertina e nelle aperture; nelle sezioni le foto d'ambiente.
   Il punto di ritaglio è il soggetto trovato dall'analisi; le foto in fondo alle sezioni hanno un taglio più stretto. */
import type { Doc, ImageRef, Section } from '../types'
import { FORMATS } from './engine'
import type { PhotoInfo } from './photo'

export interface PhotoIn { id: string; name: string; info: PhotoInfo }
export interface Placement { photo: string; name: string; kind: PhotoInfo['kind']; where: string | null; reason: string; warn?: string }

const STOP = new Set(['della', 'delle', 'degli', 'dello', 'nella', 'nelle', 'negli', 'nello', 'sulla', 'sulle', 'alla', 'alle', 'agli', 'allo', 'dalla', 'dalle', 'con', 'per', 'tra', 'fra', 'una', 'uno', 'gli', 'del', 'dei', 'nel', 'nei', 'sul', 'sui', 'foto', 'img', 'image', 'immagine', 'copia', 'jpg', 'jpeg', 'png', 'final', 'definitiva', 'and', 'the'])
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ')
export const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w))
/** Somiglianza tra il nome di un file e un titolo: parole in comune (anche per radice, es. «ambiente»/«ambientale»). */
export function nameScore(file: string, title: string): number {
  const a = words(file.replace(/\.[a-z]+$/i, '')), b = words(title)
  let s = 0
  for (const x of a) if (b.some(y => y === x || (x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5)))) s++
  return s
}

const ref = (p: PhotoIn, zoom = 1): ImageRef => ({ asset: p.id, cx: p.info.cx, cy: p.info.cy, zoom })

/** Larghezza utile della foto per un riquadro w×h mm: meno di 2/3 dei pixel per 300 ppi = avviso. */
function lowRes(p: PhotoIn, wmm: number, hmm: number, zoom: number): string | undefined {
  const ar = wmm / hmm
  const cw = (p.info.width / p.info.height > ar ? p.info.height * ar : p.info.width) * zoom
  const need = wmm / 25.4 * 300
  if (cw < need * 0.66) return `Risoluzione bassa per la stampa (${Math.round(cw)} px utili su ${Math.round(need)}): va bene per il PDF digitale.`
  return undefined
}

export function placePhotos(doc: Doc, photos: PhotoIn[], onlyEmpty = true): Placement[] {
  const isBr = doc.meta.kind === 'brochure'
  const F0 = FORMATS[doc.meta.format as 'a4v' | 'a4o'] ?? FORMATS.a4v
  // brochure: pagina 303 × 177; le foto delle pagine vanno a tutta pagina (pagina colore) o nel cerchio (pagina prodotto)
  const F = isBr ? { ...F0, PW: 303, PH: 177, ML: 12.7, MR: 12.7, BAND: 183 } : F0
  const PWB = F.PW + 6, PHB = F.PH + 6
  const out: Placement[] = []
  const left = new Map(photos.map(p => [p.id, p]))
  const take = (p: PhotoIn, where: string, reason: string, warn?: string) => { left.delete(p.id); out.push({ photo: p.id, name: p.name, kind: p.info.kind, where, reason, warn }) }
  const sections = doc.chapters.flatMap((ch, ci) => ch.sections.map((s, si) => ({ s, ch, ci, si })))
  const bandOk = (s: Section) => isBr ? (s.layout.page === 'colore' || s.layout.page === 'prodotto') && (!onlyEmpty || !s.layout.band) : s.layout.mode !== 'highlights' && s.layout.cols !== 'w' && (!onlyEmpty || !s.layout.band)
    && s.blocks.filter(b => b.type === 'p' || b.type === 'li').length >= 2
  const setBand = (s: Section, p: PhotoIn) => { s.layout.band = ref(p, isBr ? 1 : 0.8) }
  const coverFree = () => !onlyEmpty || !doc.cover.image
  const sectionLabel = (x: { s: Section; ch: { title: string } }) => isBr
    ? `${x.s.layout.page === 'prodotto' ? 'Nel cerchio della pagina' : 'A tutta pagina in'} «${x.s.title || x.ch.title}»`
    : `In fondo alla sezione «${x.s.title || x.ch.title}»`

  // 1. segnaposto nel Word: [Foto: nome-file]
  for (const { s } of sections) for (const b of s.blocks) {
    if (b.type !== 'image' || b.image || !b.hint) continue
    let best: PhotoIn | null = null, bs = 0
    for (const p of left.values()) {
      const exact = norm(p.name).replace(/\.[a-z]+$/, '') === norm(b.hint).replace(/\.[a-z]+$/, '')
      const sc = exact ? 99 : nameScore(p.name, b.hint)
      if (sc > bs) { bs = sc; best = p }
    }
    if (best) {
      const w = F.PW - F.ML - F.MR
      b.image = ref(best)
      take(best, `Nel testo della sezione «${s.title}»`, `Nel Word c'era l'indicazione «${b.hint}»`, lowRes(best, w, w * b.ratio, 1))
    }
  }

  // 2. nome del file
  for (const p of [...left.values()]) {
    if (/copertina|cover/i.test(p.name) && coverFree()) {
      doc.cover.image = ref(p)
      take(p, 'Copertina', 'Il nome del file dice «copertina»', lowRes(p, PWB, PHB, 1))
      continue
    }
    let best: { score: number; ch?: number; sec?: (typeof sections)[number] } = { score: 0 }
    doc.chapters.forEach((ch, ci) => { const sc = nameScore(p.name, ch.title); if (sc > best.score) best = { score: sc, ch: ci } })
    for (const x of sections) { const sc = nameScore(p.name, x.s.title); if (sc > best.score) best = { score: sc, sec: x } }
    if (!best.score) continue
    if (best.ch !== undefined) {
      const ch = doc.chapters[best.ch]!
      if (p.info.kind === 'soggetto' && (!onlyEmpty || !ch.image)) {
        ch.image = ref(p)
        take(p, `Apertura del capitolo «${ch.title}»`, `Il nome del file richiama il capitolo «${ch.title}»`, lowRes(p, PWB, PHB, 1))
        continue
      }
      const x = sections.find(x => x.ci === best.ch && bandOk(x.s))
      if (x) { setBand(x.s, p); take(p, sectionLabel(x), `Il nome del file richiama il capitolo «${ch.title}»; è una foto d'ambiente, quindi va in una sezione`, lowRes(p, PWB, F.BAND, 0.8)); continue }
    } else if (best.sec && bandOk(best.sec.s)) {
      setBand(best.sec.s, p)
      take(p, sectionLabel(best.sec), `Il nome del file richiama la sezione «${best.sec.s.title}»`, lowRes(p, PWB, F.BAND, 0.8))
    }
  }

  // 3. cosa mostra la foto
  const strong = (a: PhotoIn, b: PhotoIn) => (b.info.concentration + b.info.bgBlur) - (a.info.concentration + a.info.bgBlur)
  const subj = [...left.values()].filter(p => p.info.kind === 'soggetto').sort(strong)
  const amb = [...left.values()].filter(p => p.info.kind === 'ambiente').sort((a, b) => b.info.width * b.info.height - a.info.width * a.info.height)
  const pages: { label: string; set: (p: PhotoIn) => void }[] = []
  if (coverFree()) pages.push({ label: 'Copertina', set: p => { doc.cover.image = ref(p) } })
  for (const ch of doc.chapters) if (!onlyEmpty || !ch.image) pages.push({ label: `Apertura del capitolo «${ch.title}»`, set: p => { ch.image = ref(p) } })
  for (const slot of pages) {
    const p = subj.shift()
    if (!p) break
    slot.set(p)
    take(p, slot.label, isBr ? 'Foto con un soggetto in evidenza: va in copertina e nelle aperture' : 'Foto con un soggetto in evidenza: nel Report va in copertina e nelle aperture dei capitoli', lowRes(p, PWB, PHB, 1))
  }
  // aperture rimaste senza foto: meglio una foto d'ambiente che il viola pieno
  const emptyPages = pages.filter(sl => !out.some(o => o.where === sl.label))
  for (const slot of emptyPages) {
    const p = amb.shift()
    if (!p) break
    slot.set(p)
    take(p, slot.label, 'Non c\'erano abbastanza foto con soggetto per le pagine intere: uso una foto d\'ambiente', lowRes(p, PWB, PHB, 1))
  }
  // brochure: le foto con soggetto avanzate vanno nelle pagine colore e prodotto (il soggetto sta a destra, il testo a sinistra)
  if (isBr) for (const x of sections.filter(x => bandOk(x.s))) {
    const p = subj.shift() ?? amb.shift()
    if (!p) break
    setBand(x.s, p)
    take(p, sectionLabel(x), p.info.kind === 'soggetto' ? 'Foto con soggetto: nella pagina il testo sta a sinistra e il soggetto a destra' : 'Foto d\'ambiente come fondo della pagina', lowRes(p, x.s.layout.page === 'prodotto' ? 154 : PWB, x.s.layout.page === 'prodotto' ? 154 : PHB, 1))
  }
  // foto d'ambiente in fondo alle sezioni, distribuite in modo regolare (sezioni con più testo prima)
  // bilancio: prima i posti scelti dal regista per il ritmo (distanziati, mai subito dopo un'apertura)
  const elig0 = sections.filter(x => bandOk(x.s) && !(x.s.layout.look === 'card'))
  const slots = elig0.filter(x => x.s.layout.bandSlot)
  const elig = !isBr && slots.length && slots.length >= amb.length ? slots : elig0
  if (amb.length && elig.length) {
    const n = Math.min(amb.length, elig.length)
    const step = elig.length / n
    const chosen = Array.from({ length: n }, (_, i) => elig[Math.min(elig.length - 1, Math.floor(i * step + step / 2))]!)
    for (const x of chosen) {
      const p = amb.shift()!
      setBand(x.s, p)
      take(p, sectionLabel(x), 'Foto d\'ambiente: va in fondo alle sezioni, con un taglio stretto (distribuite lungo il documento)', lowRes(p, PWB, F.BAND, 0.8))
    }
  }
  for (const p of left.values()) {
    out.push({
      photo: p.id, name: p.name, kind: p.info.kind, where: null,
      reason: isBr
        ? 'Copertina, aperture e pagine con foto (colore o prodotto) sono già tutte occupate. La trovi tra le immagini del documento: per usarla, imposta una pagina come «Colore» o «Prodotto».'
        : p.info.kind === 'soggetto'
        ? 'Foto con soggetto: nel Report va solo in copertina e nelle aperture, che sono già tutte occupate. La trovi tra le immagini del documento.'
        : 'Non ci sono altre sezioni adatte (testo sufficiente e senza foto). La trovi tra le immagini del documento.',
    })
  }
  // resoconto nell'ordine del documento: copertina, capitoli e sezioni in ordine, poi le foto non usate
  const order = (w: string | null) => {
    if (!w) return 1e9
    if (w === 'Copertina') return 0
    const ci = doc.chapters.findIndex(ch => w.includes(`«${ch.title}»`))
    if (ci >= 0) return (ci + 1) * 1000
    const x = sections.findIndex(x => w.includes(`«${x.s.title || x.ch.title}»`))
    return x >= 0 ? (sections[x]!.ci + 1) * 1000 + sections[x]!.si + 1 : 5e8
  }
  return out.sort((a, b) => order(a.where) - order(b.where))
}
