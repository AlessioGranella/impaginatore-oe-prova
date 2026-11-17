import { useState } from 'react'
import { assetUrl } from '../api'
import { FORMAT_DIMS, type Block, type Doc, type Layout, type PageType, type TableBlock, type TextType } from '../types'
import { Icon, Menu, Segment } from '../ui/ui'
import { AssetGridPicker, ImageField } from './ImagePicker'
import RichText from './RichText'
import TableEditor from './TableEditor'
import { TEXT_TYPES, blockLabel, clone, locate, move, newBlock, newChapter, newSection, type Sel } from './store'
import { nid } from '../api'

interface P {
  doc: Doc; sel: Sel; setSel: (s: Sel) => void; update: (fn: (d: Doc) => void, coalesce?: string) => void
  canEdit: boolean; docId: string; onComment: (blockId: string) => void; focusNew: string | null; setFocusNew: (id: string | null) => void
}

export default function Inspector(p: P) {
  const { doc, sel } = p
  if (!sel) return <Empty />
  if (sel.kind === 'cover') return <CoverPanel {...p} />
  const w = locate(doc, sel.id)
  if (!w) return <Empty />
  if (sel.kind === 'chapter') return <ChapterPanel {...p} ci={w.ci} />
  if (sel.kind === 'section' && w.sec) return <SectionPanel {...p} ci={w.ci} si={w.si!} />
  if (sel.kind === 'block' && w.block) return <BlockPanel {...p} ci={w.ci} si={w.si!} bi={w.bi!} />
  return <Empty />
}

function Empty() {
  return (
    <div className="insp__head">
      <h2>Modifica</h2>
      <p className="hint">Clicca un testo, una foto o un box nell'anteprima, oppure una voce della struttura a sinistra. Qui compaiono i suoi campi.</p>
      <p className="hint">Le modifiche restano in bozza finché non premi «Salva versione»: ogni salvataggio crea una versione che puoi rivedere o ripristinare.</p>
    </div>
  )
}

const dims = (doc: Doc) => FORMAT_DIMS[doc.meta.format] ?? FORMAT_DIMS.a4v

/* ---------------------------------------------------------------- copertina */
function CoverPanel({ doc, update, canEdit, docId }: P) {
  const D = dims(doc)
  return (
    <>
      <div className="insp__head"><span className="insp__crumb">Documento</span><h2>Copertina e sommario</h2></div>
      <label className="oe-field"><span className="oe-label">Titolo</span>
        <input className="oe-input" disabled={!canEdit} value={doc.cover.title} onChange={e => update(d => { d.cover.title = e.target.value; d.meta.title = e.target.value }, 'cover-title')} /></label>
      <label className="oe-field"><span className="oe-label">{doc.meta.kind === 'brochure' ? 'Etichetta sopra il titolo (chip, facoltativa)' : 'Sottotitolo (in Lime, maiuscolo)'}</span>
        <input className="oe-input" disabled={!canEdit} value={doc.cover.subtitle} onChange={e => update(d => { d.cover.subtitle = e.target.value }, 'cover-sub')} /></label>
      <ImageField label="Foto di copertina" docId={docId} canEdit={canEdit} use="copertina" aspect={(D.PW + 6) / (D.PH + 6)}
        value={doc.cover.image} onChange={v => update(d => { d.cover.image = v })} />
      <div className="insp__group">
        <h3>{doc.meta.kind === 'brochure' ? 'Indice' : 'Sommario'}</h3>
        <label className="oe-check"><input type="checkbox" disabled={!canEdit} checked={doc.toc.show} onChange={e => update(d => { d.toc.show = e.target.checked })} /> Mostra la pagina {doc.meta.kind === 'brochure' ? 'dell\'indice' : 'del sommario'}</label>
        {doc.toc.show && <label className="oe-field"><span className="oe-label">Titolo della pagina</span>
          <input className="oe-input" disabled={!canEdit} value={doc.toc.title} onChange={e => update(d => { d.toc.title = e.target.value }, 'toc')} /></label>}
      </div>
      <div className="insp__group">
        <h3>Quarta di copertina</h3>
        <label className="oe-check"><input type="checkbox" disabled={!canEdit} checked={doc.back.show} onChange={e => update(d => { d.back.show = e.target.checked })} /> {doc.meta.kind === 'brochure' ? 'Pagina finale con logo, sedi e contatti' : 'Pagina finale viola con il logo'}</label>
        {doc.meta.kind === 'brochure' && doc.back.show && <ImageField label="Foto della pagina finale (facoltativa)" optional docId={docId} canEdit={canEdit} use="chiusura" aspect={(D.PW + 6) / (D.PH + 6)}
          value={doc.back.image ?? null} onChange={v => update(d => { d.back.image = v })} />}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- capitolo */
function ChapterPanel({ doc, update, canEdit, docId, setSel, ci }: P & { ci: number }) {
  const ch = doc.chapters[ci]!
  const D = dims(doc)
  return (
    <>
      <div className="insp__head"><span className="insp__crumb">Capitolo {String(ci + 1).padStart(2, '0')}</span><h2>{ch.title || 'Capitolo'}</h2></div>
      <label className="oe-field"><span className="oe-label">Titolo del capitolo</span>
        <input className="oe-input" disabled={!canEdit} value={ch.title} onChange={e => update(d => { d.chapters[ci]!.title = e.target.value }, `ch-${ch.id}`)} /></label>
      <ImageField label="Foto della pagina di apertura" docId={docId} canEdit={canEdit} use="apertura" aspect={(D.PW + 6) / (D.PH + 6)}
        value={ch.image} onChange={v => update(d => { d.chapters[ci]!.image = v })} />
      <p className="hint">Regola del report: gli animali dell'archivio vanno solo nelle aperture dei capitoli; nelle sezioni si usano le foto d'ambiente (Scenari).</p>
      {canEdit && (
        <div className="insp__group">
          <h3>Capitolo</h3>
          <div className="insp__actions">
            <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={() => { const s = newSection(); update(d => { d.chapters[ci]!.sections.push(s) }); setSel({ kind: 'section', id: s.id }) }}><Icon name="plus" />Sezione</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm" disabled={ci === 0} onClick={() => update(d => move(d.chapters, ci, -1))}><Icon name="up" />Su</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm" disabled={ci === doc.chapters.length - 1} onClick={() => update(d => move(d.chapters, ci, 1))}><Icon name="down" />Giù</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => { const c = newChapter(); update(d => { d.chapters.splice(ci + 1, 0, c) }); setSel({ kind: 'chapter', id: c.id }) }}><Icon name="plus" />Capitolo dopo</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm btn-danger" disabled={doc.chapters.length <= 1} onClick={() => {
              if (!confirm(`Eliminare il capitolo «${ch.title}» con tutte le sue sezioni?`)) return
              update(d => { d.chapters.splice(ci, 1) }); setSel(null)
            }}><Icon name="trash" />Elimina</button>
          </div>
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- sezione */
function SectionPanel({ doc, update, canEdit, docId, setSel, ci, si }: P & { ci: number; si: number }) {
  const ch = doc.chapters[ci]!
  const s = ch.sections[si]!
  const L = s.layout
  const D = dims(doc)
  const [orn, setOrn] = useState(false)
  const setL = (fn: (l: typeof L) => void) => update(d => fn(d.chapters[ci]!.sections[si]!.layout))
  const two = doc.meta.format === 'a4o' ? ['2 colonne', '3 colonne'] : ['1 colonna', '2 colonne']
  return (
    <>
      <div className="insp__head"><span className="insp__crumb">{String(ci + 1).padStart(2, '0')} {ch.title}</span><h2>{s.title || 'Sezione senza titolo'}</h2></div>
      <label className="oe-field"><span className="oe-label">{doc.meta.kind === 'brochure' ? 'Titolo grande della pagina' : 'Titolo della sezione'}</span>
        <input className="oe-input" disabled={!canEdit} value={s.title} onChange={e => update(d => { d.chapters[ci]!.sections[si]!.title = e.target.value }, `sec-${s.id}`)} /></label>

      {doc.meta.kind === 'brochure' ? <BrochureLayout L={L} kicker={s.kicker ?? ''} chapter={ch.title} canEdit={canEdit} docId={docId}
        setKicker={v => update(d => { d.chapters[ci]!.sections[si]!.kicker = v }, `kick-${s.id}`)} setL={setL} /> :
      <div className="insp__group">
        <h3>Impaginazione</h3>
        <div className="oe-field"><span className="oe-label">Tipo di pagina</span>
          <Segment label="Tipo di pagina" value={L.mode} onChange={v => canEdit && setL(l => { l.mode = v })}
            options={[{ v: 'normal', l: 'Testo' }, { v: 'highlights', l: 'Numeri chiave (pagina viola)' }]} /></div>
        {L.mode === 'highlights' ? (
          <p className="hint">La pagina viola mostra in grande i numeri della prima tabella della sezione (colonne: valore · descrizione).</p>
        ) : (
          <>
            <div className="oe-field"><span className="oe-label">Colonne del testo</span>
              <Segment label="Colonne" value={L.cols} onChange={v => canEdit && setL(l => { l.cols = v })}
                options={[{ v: 1, l: two[0]! }, { v: 2, l: two[1]! }, { v: 'w', l: 'Tutta larghezza' }]} />
              <span className="hint">{L.cols === 1 ? 'Testo con colonna di margine a sinistra (per citazioni e illustrazioni).' : L.cols === 'w' ? 'Per sezioni fatte soprattutto di tabelle (indici GRI, allegati).' : 'Testo lungo su più colonne; tabelle e box restano a tutta larghezza.'}</span></div>
            <label className="oe-check"><input type="checkbox" disabled={!canEdit} checked={!!L.newpage} onChange={e => setL(l => { l.newpage = e.target.checked })} /> Inizia su una pagina nuova</label>
            <ImageField label="Foto in fondo alla pagina (facoltativa)" optional docId={docId} canEdit={canEdit} use="banda" aspect={(D.PW + 6) / D.BAND}
              value={L.band} onChange={v => setL(l => { l.band = v })} />
            {L.cols === 1 && (
              <div className="oe-field"><span className="oe-label">Illustrazione pixel nel margine (facoltativa)</span>
                <div className="insp__actions">
                  {L.ornament && <img src={assetUrl(L.ornament, true)} alt="" style={{ width: 56, height: 56, objectFit: 'contain', border: '1px solid var(--oe-gray-200)' }} />}
                  {canEdit && <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={() => setOrn(true)}>{L.ornament ? 'Cambia' : 'Scegli illustrazione'}</button>}
                  {canEdit && L.ornament && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => setL(l => { l.ornament = null })}>Togli</button>}
                </div>
                <span className="hint">Con parsimonia: una ogni tanto, come ornamento. Nella versione di prova l'archivio delle illustrazioni OE non c'è ancora.</span></div>
            )}
            <div className="oe-field"><span className="oe-label">Compattezza</span>
              <Segment label="Compattezza" value={L.tight || 0} onChange={v => canEdit && setL(l => { l.tight = v })}
                options={[{ v: 0, l: 'Normale' }, { v: 1, l: 'Leggera' }, { v: 2, l: 'Media' }, { v: 3, l: 'Massima' }]} />
              <span className="hint">Riduce spazi e interlinea per non lasciare poche righe da sole su una pagina.</span></div>
          </>
        )}
      </div>}
      {canEdit && (
        <div className="insp__group">
          <h3>{doc.meta.kind === 'brochure' ? 'Pagina' : 'Sezione'}</h3>
          <div className="insp__actions">
            <AddBlock onAdd={t => { const b = newBlock(t); update(d => { d.chapters[ci]!.sections[si]!.blocks.push(b) }); setSel({ kind: 'block', id: b.id }) }} label="Aggiungi contenuto in fondo" />
            <button className="oe-btn oe-btn--ghost oe-btn--sm" disabled={si === 0} onClick={() => update(d => move(d.chapters[ci]!.sections, si, -1))}><Icon name="up" />Su</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm" disabled={si === ch.sections.length - 1} onClick={() => update(d => move(d.chapters[ci]!.sections, si, 1))}><Icon name="down" />Giù</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => { const n = newSection(); update(d => { d.chapters[ci]!.sections.splice(si + 1, 0, n) }); setSel({ kind: 'section', id: n.id }) }}><Icon name="plus" />Sezione dopo</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm btn-danger" onClick={() => {
              if (!confirm(`Eliminare la sezione «${s.title}» e tutti i suoi contenuti?`)) return
              update(d => { d.chapters[ci]!.sections.splice(si, 1) }); setSel({ kind: 'chapter', id: ch.id })
            }}><Icon name="trash" />Elimina</button>
          </div>
        </div>
      )}
      {orn && <AssetGridPicker kind="illustrazione" title="Illustrazione pixel" value={L.ornament} onClose={() => setOrn(false)} onPick={id => { setL(l => { l.ornament = id }); setOrn(false) }} />}
    </>
  )
}

/* ---------------------------------------------------------------- brochure: tipo di pagina */
const PAGES: { v: PageType; l: string; help: string }[] = [
  { v: 'testo', l: 'Testo', help: 'Titolo e voci in griglia: ogni sottotitolo (in maiuscolo bluette) con il suo testo. Senza sottotitoli il testo va su una o due colonne.' },
  { v: 'card', l: 'Card', help: 'Riquadri grigi affiancati con icona, titolo e testo, su fondo a puntini. Usa la prima tabella (titolo · testo, icone dal box) o le coppie sottotitolo + testo.' },
  { v: 'colore', l: 'Colore', help: 'Pagina al vivo: foto (o bluette pieno) con il testo bianco a sinistra. Scegli una foto con il soggetto a destra.' },
  { v: 'prodotto', l: 'Prodotto', help: 'Testo a sinistra e un grande cerchio colorato a destra con la foto o il mockup. Sottotitoli = riga in maiuscolo; voci di elenco = tre punti in basso.' },
  { v: 'numeri', l: 'Numeri', help: 'Numeri grandi in fila (tabella: valore · unità · descrizione) e, se c\'è un\'immagine nella sezione, una fascia grigia con i loghi.' },
  { v: 'griglia', l: 'Griglia', help: 'Fino a otto voci su quattro colonne (titolo bluette e testo), su fondo a puntini: per progetti, casi, servizi.' },
  { v: 'citazione', l: 'Citazione', help: 'Una frase grande in serif. Le parti in grassetto diventano colorate.' },
]
function BrochureLayout({ L, kicker, chapter, canEdit, docId, setKicker, setL }: {
  L: Layout; kicker: string; chapter: string; canEdit: boolean; docId: string; setKicker: (v: string) => void; setL: (fn: (l: Layout) => void) => void
}) {
  const page = L.page ?? 'testo'
  const P = PAGES.find(x => x.v === page)!
  return (
    <div className="insp__group">
      <h3>Impaginazione</h3>
      <label className="oe-field"><span className="oe-label">Etichetta della chip</span>
        <input className="oe-input" disabled={!canEdit} value={kicker} placeholder={chapter} onChange={e => setKicker(e.target.value)} />
        <span className="hint">Il riquadro lime con la freccia sopra il titolo. Se è vuota uso il titolo del capitolo.</span></label>
      <div className="oe-field"><span className="oe-label">Tipo di pagina</span>
        <div className="pagetypes" role="radiogroup" aria-label="Tipo di pagina">
          {PAGES.map(x => <button key={x.v} role="radio" aria-checked={page === x.v} disabled={!canEdit} className={`oe-btn oe-btn--sm ${page === x.v ? 'oe-btn--primary' : 'oe-btn--secondary'}`} onClick={() => setL(l => { l.page = x.v })}>{x.l}</button>)}
        </div>
        <span className="hint">{P.help}</span></div>
      {(page === 'colore' || page === 'prodotto') && (
        <ImageField label={page === 'colore' ? 'Foto della pagina (facoltativa)' : 'Foto o mockup nel cerchio'} optional docId={docId} canEdit={canEdit} use={page === 'colore' ? 'pagina' : 'cerchio'}
          aspect={page === 'colore' ? 309 / 183 : 1} value={L.band} onChange={v => setL(l => { l.band = v })} />
      )}
      {page === 'prodotto' && (
        <>
          <div className="oe-field"><span className="oe-label">Colore del cerchio</span>
            <Segment label="Colore del cerchio" value={L.circle ?? 'magenta'} onChange={v => canEdit && setL(l => { l.circle = v })}
              options={[{ v: 'magenta', l: 'Magenta' }, { v: 'verde', l: 'Verde' }, { v: 'bluette', l: 'Bluette' }, { v: 'lime', l: 'Lime' }]} />
            <span className="hint">Nelle brochure OE: magenta per Externalytics, verde per Sonar.</span></div>
          <div className="oe-field"><span className="oe-label">Immagine</span>
            <Segment label="Immagine nel cerchio" value={L.circleFit ?? 'ritaglia'} onChange={v => canEdit && setL(l => { l.circleFit = v })}
              options={[{ v: 'ritaglia', l: 'Ritagliata nel cerchio' }, { v: 'sopra', l: 'Sopra il cerchio (mockup)' }]} />
            <span className="hint">«Sopra il cerchio» è per i mockup con lo sfondo trasparente (PNG), come il portatile con la piattaforma.</span></div>
        </>
      )}
    </div>
  )
}

function AddBlock({ onAdd, label }: { onAdd: (t: Block['type'] | TextType) => void; label: string }) {
  return (
    <Menu button={(_, t) => <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={t}><Icon name="plus" />{label}</button>}>
      {close => (
        <>
          {TEXT_TYPES.map(o => <button key={o.v} className="menu__item" onClick={() => { close(); onAdd(o.v) }}>{o.l}</button>)}
          <div className="menu__sep" />
          <button className="menu__item" onClick={() => { close(); onAdd('table') }}>Tabella o box grafico<small>numeri chiave, linea del tempo, barre…</small></button>
          <button className="menu__item" onClick={() => { close(); onAdd('image') }}>Immagine</button>
        </>
      )}
    </Menu>
  )
}

/* ---------------------------------------------------------------- blocco */
function BlockPanel({ doc, update, canEdit, docId, setSel, onComment, ci, si, bi, focusNew, setFocusNew }: P & { ci: number; si: number; bi: number }) {
  const ch = doc.chapters[ci]!
  const s = ch.sections[si]!
  const b = s.blocks[bi]!
  const setB = <T extends Block>(fn: (x: T) => void, co?: string) => update(d => fn(d.chapters[ci]!.sections[si]!.blocks[bi] as T), co)
  const D = dims(doc)
  const isText = b.type !== 'table' && b.type !== 'image'

  const split = (before: string, after: string) => {
    const nb = { id: nid(), type: b.type === 'h4' || b.type === 'quote' ? 'p' : b.type, html: after } as Block
    update(d => {
      const blocks = d.chapters[ci]!.sections[si]!.blocks
      ;(blocks[bi] as { html: string }).html = before
      blocks.splice(bi + 1, 0, nb)
    })
    setFocusNew(nb.id)
    setSel({ kind: 'block', id: nb.id })
  }

  return (
    <>
      <div className="insp__head">
        <span className="insp__crumb">{String(ci + 1).padStart(2, '0')} {ch.title} › {s.title || 'sezione'}</span>
        <h2>{blockLabel(b)}</h2>
      </div>
      {isText && (
        <>
          <div className="oe-field"><span className="oe-label">Tipo</span>
            <Segment label="Tipo di testo" value={b.type as TextType} onChange={v => canEdit && setB(x => { (x as { type: string }).type = v })}
              options={TEXT_TYPES.map(t => ({ v: t.v, l: t.l }))} /></div>
          {canEdit ? (
            <RichText key={b.id} label="Testo" value={(b as { html: string }).html} short={b.type === 'h4'} autoFocus={focusNew === b.id}
              onChange={h => { setB(x => { (x as { html: string }).html = h }, `txt-${b.id}`); if (focusNew) setFocusNew(null) }} onSplit={split} />
          ) : <div className="rte"><div className="rte__area" dangerouslySetInnerHTML={{ __html: (b as { html: string }).html }} /></div>}
          {canEdit && <span className="hint">Invio = nuovo paragrafo · Maiusc+Invio = a capo · ⌘B = grassetto. Il corsivo non si usa nei report OE.</span>}
          {b.type === 'p' && bi === 0 && s.layout.cols !== 'w' && (
            <label className="oe-check"><input type="checkbox" disabled={!canEdit} checked={(b as { lead?: boolean }).lead !== false}
              onChange={e => setB(x => { (x as { lead?: boolean }).lead = e.target.checked })} /> Primo paragrafo in grande (attacco)</label>
          )}
        </>
      )}
      {b.type === 'table' && <TableEditor b={b} canEdit={canEdit} set={fn => setB<TableBlock>(fn, `tbl-${b.id}`)} />}
      {b.type === 'image' && (
        <>
          <ImageField label="Immagine" docId={docId} canEdit={canEdit} use="figura" aspect={1 / (b.ratio || 0.5625)}
            value={b.image} onChange={v => setB(x => { (x as typeof b).image = v })} />
          <div className="oe-field"><span className="oe-label">Proporzioni</span>
            <Segment label="Proporzioni" value={b.ratio} onChange={v => canEdit && setB(x => { (x as typeof b).ratio = v })}
              options={[{ v: 0.5625, l: '16:9' }, { v: 0.75, l: '4:3' }, { v: 0.4, l: 'Panoramica' }, { v: 1, l: 'Quadrata' }]} /></div>
          <label className="oe-field"><span className="oe-label">Didascalia</span>
            <input className="oe-input" disabled={!canEdit} value={b.caption} onChange={e => setB(x => { (x as typeof b).caption = e.target.value }, `cap-${b.id}`)} /></label>
        </>
      )}
      <div className="insp__group">
        <h3>Blocco</h3>
        <div className="insp__actions">
          <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={() => onComment(b.id)}><Icon name="comment" />Commenta</button>
          {canEdit && <>
            <AddBlock label="Aggiungi sotto" onAdd={t => { const n = newBlock(t); update(d => { d.chapters[ci]!.sections[si]!.blocks.splice(bi + 1, 0, n) }); setFocusNew(n.id); setSel({ kind: 'block', id: n.id }) }} />
            <button className="oe-btn oe-btn--ghost oe-btn--sm" disabled={bi === 0} onClick={() => update(d => move(d.chapters[ci]!.sections[si]!.blocks, bi, -1))}><Icon name="up" />Su</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm" disabled={bi === s.blocks.length - 1} onClick={() => update(d => move(d.chapters[ci]!.sections[si]!.blocks, bi, 1))}><Icon name="down" />Giù</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => { const c = { ...clone(b), id: nid() }; update(d => { d.chapters[ci]!.sections[si]!.blocks.splice(bi + 1, 0, c) }); setSel({ kind: 'block', id: c.id }) }}><Icon name="copy" />Duplica</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm btn-danger" onClick={() => {
              const next = s.blocks[bi + 1] ?? s.blocks[bi - 1]
              update(d => { d.chapters[ci]!.sections[si]!.blocks.splice(bi, 1) })
              setSel(next ? { kind: 'block', id: next.id } : { kind: 'section', id: s.id })
            }}><Icon name="trash" />Elimina</button>
          </>}
        </div>
        <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setSel({ kind: 'section', id: s.id })}>Impaginazione della sezione «{s.title || 'senza titolo'}» <Icon name="arrow" /></button>
      </div>
    </>
  )
}
