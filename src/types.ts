// Modello del documento: è lo stesso JSON che il server salva in ogni versione (vedi backend/app/render/engine.py).

export type Fmt = 'a4v' | 'a4o' | 'br'
export type Kind = 'bilancio' | 'brochure'
export type Brand = 'oe' | 'civiqa' | 't33'
/** Tipi di pagina della brochure (modello: brochure OpenEconomics, Externalytics, Sonar). */
export type PageType = 'testo' | 'card' | 'colore' | 'prodotto' | 'numeri' | 'griglia' | 'citazione'
export interface ImageRef { asset: string; cx: number; cy: number; zoom: number }

export type TextType = 'p' | 'h4' | 'li' | 'quote' | 'note' | 'sign'
export type View = 'tabella' | 'kpi' | 'timeline' | 'valori' | 'elenco' | 'barre' | 'segmenti' | 'codici'

export interface TextBlock { id: string; type: TextType; html: string; lead?: boolean }
export interface TableBlock {
  id: string; type: 'table'; view: View; header: boolean; caption: string
  rows: string[][]; icons: (string | null)[]
}
export interface ImageBlock { id: string; type: 'image'; image: ImageRef | null; caption: string; ratio: number; hint?: string }
export type Block = TextBlock | TableBlock | ImageBlock

export interface Layout {
  cols: 1 | 2 | 'w'; mode: 'normal' | 'highlights'; band: ImageRef | null
  tight: number; ornament: string | null; newpage?: boolean
  /** solo brochure */
  page?: PageType; circle?: 'magenta' | 'verde' | 'lime' | 'bluette'; circleFit?: 'ritaglia' | 'sopra'
  /** solo bilancio: modalità scelta dal regista (o a mano); cols/mode ne derivano */
  look?: Look
  /** false = scelta a mano: il regista non la cambia */
  auto?: boolean
  /** bilancio, modalità «dato»: numero in evidenza preso dal testo della sezione */
  hero?: { n: string; l: string } | null
  /** bilancio: posto buono per una foto in fondo (deciso dal regista per il ritmo) */
  bandSlot?: boolean
}
/** Modalità di impaginazione delle sezioni del bilancio. */
export type Look = 'colonne' | 'margine' | 'largo' | 'numeri' | 'dato' | 'card' | 'citazione'
export interface Section { id: string; title: string; kicker?: string; layout: Layout; blocks: Block[]
  /** brochure: pagina che continua la sezione precedente (non va nell'indice) */
  cont?: boolean }
export interface Chapter { id: string; title: string; image: ImageRef | null; sections: Section[] }
export interface Doc {
  meta: { title: string; format: Fmt; kind?: Kind; brand?: Brand }
  cover: { id: string; title: string; subtitle: string; image: ImageRef | null }
  toc: { show: boolean; title: string }
  chapters: Chapter[]
  back: { show: boolean; image?: ImageRef | null }
}

export interface User { id: string; email: string; name: string; is_admin: boolean }
export interface Me extends User { ai: boolean; mail: boolean; formats: Record<string, string> }
export type Role = 'proprietario' | 'modifica' | 'commento'
export interface DocRow {
  id: string; title: string; format: Fmt; kind?: Kind; brand?: Brand; updated_at: number; created_at: number; head: number
  role: Role; author: string; open_comments: number; source_name?: string
}
export interface DocFull extends DocRow { data: Doc; members: (User & { role: Role })[] }
export interface VersionRow { number: number; message: string; created_at: number; author: string }
export interface Asset {
  id: string; kind: 'foto' | 'icona' | 'illustrazione'; source: string; name: string
  category?: string; width?: number; height?: number; meta?: Record<string, string>
}
export interface Box { x: number; y: number; w: number; h: number }
export interface PageR { n: number; img: string; w: number; h: number; boxes: Record<string, Box> }
export interface Warning { section: string; title: string; page: number; fill: number; tight: number }
export interface RenderResult { key: string; pages: PageR[]; warnings: Warning[]; changes: Record<string, number> }
export interface Comment {
  id: string; document_id: string; version: number; block_id: string | null; page: number | null
  author_id: string; author: string; body: string; parent_id: string | null; resolved: boolean
  created_at: number; mentions: string[]
  /** frase selezionata nella pagina (commento su un passaggio, come in Acrobat) */
  quote?: string
}
export interface Notification {
  id: string; document_id: string; document_title: string; comment_id: string | null; kind: string
  actor: string; comment_body: string | null; read: number; created_at: number
}
export interface Job<T = unknown> { id: string; status: 'in_coda' | 'in_corso' | 'fatto' | 'errore'; result: T | null; error: string | null }

// misure dei formati (le stesse del motore) per i ritagli delle foto
export const FORMAT_DIMS: Record<Fmt, { PW: number; PH: number; BAND: number }> = {
  a4v: { PW: 210, PH: 297, BAND: 118 },
  a4o: { PW: 297, PH: 210, BAND: 78 },
  br: { PW: 303, PH: 177, BAND: 177 },
}
