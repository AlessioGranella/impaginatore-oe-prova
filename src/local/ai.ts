/* Modifiche scritte a parole: «accorcia questa sezione», «metti i numeri in card», «correggi 2024 in 2025 ovunque».
   Claude riceve il documento (JSON a blocchi) e la richiesta, e restituisce solo gli oggetti da cambiare,
   ognuno con il suo id. Qui le modifiche si controllano (tipi, id, immagini esistenti, solo grassetto e a capo)
   e si applicano alla bozza: si annullano con ⌘Z e diventano una versione solo con «Salva versione».
   La chiave API resta nel browser di chi la inserisce (localStorage) e va solo ad api.anthropic.com. */
import Anthropic from '@anthropic-ai/sdk'
import { nid } from '../api'
import type { Block, Chapter, Doc, ImageRef, Layout, PageType, Section, TextType, View } from '../types'

const KEY = 'imp-ai-key'
export const aiKey = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
export const setAiKey = (k: string) => { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY) } catch { /* */ } }

const TEXT: TextType[] = ['p', 'h4', 'li', 'quote', 'note', 'sign']
const VIEWS: View[] = ['tabella', 'kpi', 'timeline', 'valori', 'elenco', 'barre', 'segmenti', 'codici']
const PAGES: PageType[] = ['testo', 'card', 'colore', 'prodotto', 'numeri', 'griglia', 'citazione']

const SYSTEM = `Sei l'assistente di impaginazione di OpenEconomics Layout Designer, lo strumento con cui il team OpenEconomics impagina bilanci di sostenibilità e brochure con il design system OpenEconomics.
Il documento è un JSON a blocchi; l'impaginazione la calcola il motore, tu cambi solo contenuti e opzioni.

Modello del documento:
- meta: { title, format, kind: "bilancio" | "brochure", brand: "oe" | "civiqa" | "t33" }
- cover: { id, title, subtitle, image }   (id "cover"; nella brochure il subtitle è la chip sopra il titolo)
- toc: { show, title }   (id "toc")
- chapters[]: { id, title, image, sections[] }   (capitolo = pagina di apertura con foto)
- sections[]: { id, title, kicker?, layout, blocks[] }
  - layout (bilancio): look = "colonne" (testo a colonne) | "margine" (una colonna con margine) | "dato" (numero del testo in grande in apertura, hero {n, l}) | "card" (voci brevi in riquadri grigi) | "citazione" (citazioni grandi) | "numeri" (pagina viola coi numeri della tabella) | "largo" (tabelle a tutta larghezza); band (foto in fondo), tight 0-3 (compattezza), ornament, newpage. Per cambiare impaginazione cambia look (cols e mode ne derivano). Alterna le modalità: mai tre uguali di fila.
  - layout (brochure): page = "testo" | "card" | "colore" | "prodotto" | "numeri" | "griglia" | "citazione"; circle "magenta"|"verde"|"lime"|"bluette" e circleFit "ritaglia"|"sopra" per la pagina prodotto; band = foto della pagina colore o del cerchio
  - nella brochure ogni sezione è UNA pagina: kicker è l'etichetta della chip, title il titolo grande. La pagina testo usa coppie h4 (voce) + p; card e griglia usano la prima tabella (colonna 1 titolo, colonna 2 testo) o le coppie h4 + p; numeri usa una tabella kpi (valore · unità · descrizione oppure valore · descrizione); citazione usa blocchi quote (il grassetto diventa colore).
- blocks[]: { id, type, ... }
  - testo: type "p" | "h4" | "li" | "quote" | "note" | "sign", html (solo <strong> e <br>, nient'altro; il corsivo non si usa)
  - tabella: type "table", view "tabella"|"kpi"|"timeline"|"valori"|"elenco"|"barre"|"segmenti"|"codici", header (bool), caption, rows (array di array di stringhe), icons
  - immagine: type "image", image { asset, cx, cy, zoom } o null, caption, ratio
- Immagini: usa solo valori "asset" già presenti nel documento. Non inventarne.

Regole:
- Restituisci solo gli oggetti che cambi (blocco, sezione, capitolo, "cover" o "toc"), ognuno intero, con lo stesso id. Per aggiungere o togliere blocchi o riordinarli restituisci la sezione intera; per aggiungere sezioni restituisci il capitolo intero. I blocchi nuovi hanno id "".
- Non cambiare niente che la richiesta non tocca. Non inventare numeri, nomi o fatti: se la richiesta li presuppone e non ci sono nel documento, lascia il testo com'è e dillo nel riepilogo.
- Testi in italiano, con lo stesso registro del documento: chiaro, piano, senza frasi a effetto. Numeri nel formato italiano (1.234,5).
- Se la richiesta non si può fare cambiando il JSON (per esempio spostare un elemento a mano o cambiare un colore del brand), non cambiare niente e spiegalo nel riepilogo.
- summary: una o due frasi in italiano che dicono cosa hai cambiato, rivolte a chi ha scritto la richiesta.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changes'],
  properties: {
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'json'],
        properties: { id: { type: 'string' }, json: { type: 'string', description: "L'oggetto intero, come JSON in una stringa" } },
      },
    },
  },
}

export interface Focus { id: string | null; label: string; quote?: string }
export interface AiResult { summary: string; changes: { id: string; obj: unknown }[] }

export async function askEdit(doc: Doc, request: string, focus: Focus, signal?: AbortSignal): Promise<AiResult> {
  const key = aiKey()
  if (!key) throw new Error('Serve la chiave API di Anthropic (la trovi in console.anthropic.com).')
  // la chiave è di chi usa il tool e resta nel suo browser: per questo l'SDK va usato dal browser
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  const where = focus.id
    ? `Punto selezionato: ${focus.label} (id "${focus.id}").${focus.quote ? ` Frase selezionata nella pagina: «${focus.quote}».` : ''} Se la richiesta non dice altro, cambia solo questo punto.`
    : 'Nessun punto selezionato: la richiesta riguarda il documento intero.'
  try {
    const msg = await client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Documento:\n${JSON.stringify(doc)}`, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `${where}\n\nRichiesta: ${request}` },
        ],
      }],
    }, { signal }).finalMessage()
    if (msg.stop_reason === 'refusal') throw new Error('Claude non ha eseguito questa richiesta. Prova a riformularla.')
    if (msg.stop_reason === 'max_tokens') throw new Error('La modifica è troppo ampia per una volta sola: selezionane una parte (un capitolo o una sezione) e riprova.')
    const text = msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
    const out = JSON.parse(text) as { summary: string; changes: { id: string; json: string }[] }
    return {
      summary: out.summary,
      changes: out.changes.flatMap(c => { try { return [{ id: c.id, obj: JSON.parse(c.json) as unknown }] } catch { return [] } }),
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('La chiave API non è valida: controllala.')
    if (e instanceof Anthropic.RateLimitError) throw new Error('Troppe richieste in poco tempo: riprova tra un minuto.')
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Non riesco a raggiungere Claude: controlla la connessione.')
    if (e instanceof Anthropic.APIError) throw new Error(`Claude ha risposto con un errore (${e.status ?? '?'}): ${e.message}`)
    throw e
  }
}

/* ------------------------------------------------------------------ controllo e applicazione */
const str = (x: unknown, d = '') => (typeof x === 'string' ? x : d)
/** testo semplice (titoli, etichette, didascalie): niente tag */
const plain = (x: unknown, d = '') => (typeof x === 'string' ? x.replace(/<[^>]*>/g, '') : d)
/** Solo grassetto e a capo, come nel resto del tool. */
export function cleanHtml(s: unknown): string {
  return str(s).replace(/<(\/?)(b|strong)>/gi, '<$1strong>').replace(/<br\s*\/?>/gi, '<br>').replace(/<(?!\/?strong>|br>)[^>]*>/gi, '')
}

function assetsIn(doc: Doc): Set<string> {
  const s = new Set<string>()
  JSON.stringify(doc, (k, v) => { if ((k === 'asset' || k === 'ornament') && typeof v === 'string') s.add(v); if (k === 'icons' && Array.isArray(v)) v.forEach(i => typeof i === 'string' && s.add(i)); return v })
  return s
}
function imgRef(x: unknown, ok: Set<string>, prev: ImageRef | null): ImageRef | null {
  if (x === null) return null
  const r = x as Partial<ImageRef> | undefined
  if (!r || typeof r.asset !== 'string' || !ok.has(r.asset)) return prev
  const n = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d)
  return { asset: r.asset, cx: n(r.cx, 0.5), cy: n(r.cy, 0.5), zoom: n(r.zoom, 1) }
}
function block(x: unknown, prev: Block | undefined, ok: Set<string>, ids: Set<string>): Block | null {
  const o = (x ?? {}) as Record<string, unknown>
  let id = str(o.id)
  if (!id || ids.has(id)) id = nid()
  ids.add(id)
  const type = str(o.type)
  if ((TEXT as string[]).includes(type)) {
    const b: Block = { id, type: type as TextType, html: cleanHtml(o.html) }
    if (o.lead === false) (b as { lead?: boolean }).lead = false
    return b
  }
  if (type === 'table') {
    const rows = Array.isArray(o.rows) ? (o.rows as unknown[]).map(r => (Array.isArray(r) ? r.map(c => cleanHtml(typeof c === 'number' ? String(c) : c)) : [])) : []
    const p = prev?.type === 'table' ? prev : null
    return {
      id, type: 'table', view: (VIEWS as string[]).includes(str(o.view)) ? (o.view as View) : p?.view ?? 'tabella',
      header: typeof o.header === 'boolean' ? o.header : p?.header ?? true, caption: plain(o.caption, p?.caption ?? ''), rows,
      icons: Array.isArray(o.icons) ? (o.icons as unknown[]).map(i => (typeof i === 'string' && ok.has(i) ? i : null)) : p?.icons ?? [],
    }
  }
  if (type === 'image') {
    const p = prev?.type === 'image' ? prev : null
    return { id, type: 'image', image: imgRef(o.image, ok, p?.image ?? null), caption: plain(o.caption, p?.caption ?? ''), ratio: typeof o.ratio === 'number' ? o.ratio : p?.ratio ?? 0.5625, ...(p?.hint ? { hint: p.hint } : {}) }
  }
  return null
}
function layout(x: unknown, prev: Layout, ok: Set<string>): Layout {
  const o = (x ?? {}) as Record<string, unknown>
  const L: Layout = { ...prev }
  if (o.cols === 1 || o.cols === 2 || o.cols === 'w') L.cols = o.cols
  if (o.mode === 'normal' || o.mode === 'highlights') L.mode = o.mode
  if ('band' in o) L.band = imgRef(o.band, ok, prev.band)
  if (typeof o.tight === 'number') L.tight = Math.max(0, Math.min(3, Math.round(o.tight)))
  if (typeof o.newpage === 'boolean') L.newpage = o.newpage
  if ((PAGES as string[]).includes(str(o.page))) L.page = o.page as PageType
  if (['magenta', 'verde', 'lime', 'bluette'].includes(str(o.circle))) L.circle = o.circle as Layout['circle']
  if (o.circleFit === 'ritaglia' || o.circleFit === 'sopra') L.circleFit = o.circleFit
  const LOOKS = ['colonne', 'margine', 'largo', 'numeri', 'dato', 'card', 'citazione']
  if (LOOKS.includes(str(o.look)) && o.look !== prev.look) {
    // una modalità cambiata dall'AI conta come scelta a mano: colonne e pagina viola ne derivano
    L.look = o.look as Layout['look']; L.auto = false
    L.mode = L.look === 'numeri' ? 'highlights' : 'normal'
    L.cols = L.look === 'margine' || L.look === 'citazione' ? 1 : L.look === 'largo' ? 'w' : L.look === 'dato' ? (L.cols === 1 ? 1 : 2) : 2
  }
  if ('page' in o && o.page !== prev.page && L.page) L.auto = false
  if (o.hero && typeof o.hero === 'object') { const h = o.hero as Record<string, unknown>; L.hero = { n: plain(h.n, prev.hero?.n ?? '').slice(0, 20), l: plain(h.l, prev.hero?.l ?? '').slice(0, 220) } }
  return L
}
function section(x: unknown, prev: Section | undefined, ok: Set<string>, ids: Set<string>): Section {
  const o = (x ?? {}) as Record<string, unknown>
  // gli id dei blocchi che si stanno sostituendo tornano liberi (li ritrovano i blocchi rimandati da Claude)
  for (const b of prev?.blocks ?? []) ids.delete(b.id)
  const id = prev?.id ?? nid()
  ids.add(id)
  const old = new Map((prev?.blocks ?? []).map(b => [b.id, b]))
  const blocks = Array.isArray(o.blocks) ? (o.blocks as unknown[]).flatMap(b => { const bb = block(b, old.get(str((b as { id?: unknown })?.id)), ok, ids); return bb ? [bb] : [] }) : prev?.blocks ?? []
  const s: Section = { id, title: plain(o.title, prev?.title ?? ''), layout: layout(o.layout, prev?.layout ?? { cols: 2, mode: 'normal', band: null, tight: 0, ornament: null }, ok), blocks }
  const k = plain(o.kicker, prev?.kicker ?? '')
  if (k) s.kicker = k
  return s
}
function chapter(x: unknown, prev: Chapter, ok: Set<string>, ids: Set<string>): Chapter {
  const o = (x ?? {}) as Record<string, unknown>
  for (const s of prev.sections) ids.delete(s.id)
  const old = new Map(prev.sections.map(s => [s.id, s]))
  const sections = Array.isArray(o.sections) ? (o.sections as unknown[]).map(s => section(s, old.get(str((s as { id?: unknown })?.id)), ok, ids)) : prev.sections
  return { id: prev.id, title: plain(o.title, prev.title), image: 'image' in o ? imgRef(o.image, ok, prev.image) : prev.image, sections }
}

/** Applica le modifiche a una copia del documento. Restituisce gli id cambiati (per selezionarli e farli vedere). */
export function applyChanges(doc: Doc, changes: AiResult['changes']): { doc: Doc; touched: string[]; skipped: string[] } {
  const d = structuredClone(doc)
  const ok = assetsIn(doc)
  const ids = new Set<string>()
  JSON.stringify(d, (k, v) => { if (k === 'id' && typeof v === 'string') ids.add(v); return v })
  const touched: string[] = [], skipped: string[] = []
  for (const c of changes) {
    const o = (c.obj ?? {}) as Record<string, unknown>
    if (c.id === 'cover' || c.id === d.cover.id) {
      d.cover = { ...d.cover, title: plain(o.title, d.cover.title), subtitle: plain(o.subtitle, d.cover.subtitle), image: 'image' in o ? imgRef(o.image, ok, d.cover.image) : d.cover.image }
      touched.push(d.cover.id || 'cover'); continue
    }
    if (c.id === 'toc') { d.toc = { show: typeof o.show === 'boolean' ? o.show : d.toc.show, title: plain(o.title, d.toc.title) }; touched.push('toc'); continue }
    let done = false
    for (const [ci, ch] of d.chapters.entries()) {
      if (ch.id === c.id) { ids.delete(c.id); d.chapters[ci] = chapter(o, ch, ok, ids); done = true; break }
      for (const [si, s] of ch.sections.entries()) {
        if (s.id === c.id) { ch.sections[si] = section(o, s, ok, ids); done = true; break }
        const bi = s.blocks.findIndex(b => b.id === c.id)
        if (bi >= 0) {
          const b = block({ ...o, id: '' }, s.blocks[bi], ok, ids)
          if (b) { b.id = c.id; s.blocks[bi] = b; done = true }
          break
        }
      }
      if (done) break
    }
    if (done) touched.push(c.id); else skipped.push(c.id)
  }
  return { doc: d, touched, skipped }
}
