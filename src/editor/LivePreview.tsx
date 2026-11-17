import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { buildHtml, FORMATS, imageNeeds } from '../local/engine'
import { prepareImages } from '../local/images'
import type { Doc } from '../types'
import type { Mark, Pin, TextSel, ViewerApi, Warn } from '../viewer/main'
import { Icon, Segment } from '../ui/ui'

export type { Mark, Pin, TextSel, Warn }
export interface RenderOut { pages: number; warnings: Warn[]; ms: number }
export interface LivePreviewHandle {
  render(doc: Doc): Promise<RenderOut>
  print(doc: Doc, mode: 'digital' | 'print'): Promise<void>
  /** scrive subito il testo nuovo nella pagina visibile (la reimpaginazione arriva dopo, senza salti) */
  patch(bid: string, html: string): boolean
}

const BASE = import.meta.env.BASE_URL
const assetBase = () => new URL(`${BASE}render/`, location.href).href
type Win = Window & { imp?: ViewerApi }

/** Anteprima dal vivo: il documento viene impaginato nel browser (Vivliostyle, dentro un iframe).
    Due iframe sovrapposti: la nuova impaginazione si prepara in quello nascosto, poi si scambiano.
    Chi sta scrivendo resta nello stesso punto della pagina e non vede ricaricare niente. */
const LivePreview = forwardRef<LivePreviewHandle, {
  selId: string | null; onPick: (id: string) => void; pins: Pin[]; marks: Mark[]; onPin: (threadId: string) => void
  onTextSel: (s: (TextSel & { top: number; left: number }) | null) => void
  busy: boolean; info: string; stale: boolean; warnings: Warn[]; onFit: () => void; fitting: boolean; onGoSection: (id: string) => void; onRefresh: () => void
  brochure: boolean; overlay?: React.ReactNode; onRecompose?: () => void
}>(function LivePreview(p, ref) {
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)]
  const [front, setFront] = useState(0)
  const frontRef = useRef(0)
  const [ready, setReady] = useState([false, false])
  const [spread, setSpread] = useState<'1' | '2'>('1')
  const [showWarns, setShowWarns] = useState(false)
  const lastDoc = useRef<Doc | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const win = (i: number) => frames[i]!.current?.contentWindow as Win | null
  const waitApi = async (i: number) => { for (let k = 0; k < 200; k++) { const a = win(i)?.imp; if (a) return a; await new Promise(r => setTimeout(r, 50)) } throw new Error('Anteprima non pronta') }
  const props = useRef(p)
  props.current = p

  /** collega i richiami (clic, selezione) dell'iframe all'editor; solo quello in vista risponde */
  const wire = (i: number) => {
    const a = win(i)?.imp
    if (!a) return
    a.onPick = id => { if (frontRef.current === i) props.current.onPick(id) }
    a.onPin = t => { if (frontRef.current === i) props.current.onPin(t) }
    a.onTextSel = s => {
      if (frontRef.current !== i) return
      if (!s) return props.current.onTextSel(null)
      const f = frames[i]!.current!
      const box = wrap.current!.getBoundingClientRect(), fr = f.getBoundingClientRect()
      props.current.onTextSel({ ...s, top: fr.top - box.top + s.y, left: fr.left - box.left + s.x + s.w / 2 })
    }
  }

  const build = async (doc: Doc, mode: 'digital' | 'print', ppi: number) => {
    const imgs = await prepareImages(imageNeeds(doc), ppi)
    return buildHtml(doc, mode, imgs, assetBase())
  }
  const opts = (doc: Doc, spreadMode: boolean, anchor: ReturnType<ViewerApi['anchor']>) => {
    const F = FORMATS[doc.meta.format as 'a4v' | 'a4o'] ?? FORMATS.a4v
    const sections = doc.chapters.flatMap(c => c.sections.filter(s => s.layout?.mode !== 'highlights').map(s => ({ id: s.id, title: s.title, blocks: s.blocks.map(b => b.id), tight: Number(s.layout?.tight || 0) })))
    return { sections, contentTop: F.MT / F.PH, contentH: (F.PH - F.MT - F.MB) / F.PH, spread: spreadMode, anchor, overflow: doc.meta.kind === 'brochure' }
  }
  const decorateBoth = (i: number) => {
    const a = win(i)?.imp
    if (!a) return
    a.select(props.current.selId, false)
    a.pins(props.current.pins)
    a.marks(props.current.marks)
  }

  /** impagina nell'iframe nascosto e lo porta davanti, allo stesso punto di lettura */
  const swapRender = async (doc: Doc, spreadMode: boolean) => {
    const cur = frontRef.current, back = 1 - cur
    const html = await build(doc, 'digital', 150)
    const [fa, ba] = [await waitApi(cur), await waitApi(back)]
    wire(back)
    // il punto di lettura si misura sull'iframe visibile subito prima dello scambio
    const before = fa.anchor()
    const r = await ba.render(html, opts(doc, spreadMode, before))
    decorateBoth(back)
    const anchor = fa.anchor()
    ba.restore(anchor)
    frontRef.current = back
    setFront(back)
    props.current.onTextSel(null)
    return r
  }

  useImperativeHandle(ref, () => ({
    async render(doc) { lastDoc.current = doc; return swapRender(doc, spread === '2') },
    async print(doc, mode) {
      // immagini a 300 ppi per il PDF, poi si torna all'anteprima
      const i = frontRef.current
      const a = await waitApi(i)
      const anchor = a.anchor()
      await a.render(await build(doc, mode, 300), opts(doc, false, null))
      await new Promise<void>(res => {
        const w = win(i)!
        const after = () => { w.removeEventListener('afterprint', after); res() }
        w.addEventListener('afterprint', after)
        a.print()
        setTimeout(res, 120000)
      })
      if (lastDoc.current) { await a.render(await build(lastDoc.current, 'digital', 150), opts(lastDoc.current, spread === '2', anchor)); decorateBoth(i) }
    },
    patch(bid, html) { return win(frontRef.current)?.imp?.patch(bid, html) ?? false },
  }), [spread])

  useEffect(() => { ready.forEach((r, i) => r && wire(i)) })
  useEffect(() => { win(front)?.imp?.select(p.selId, true); win(1 - front)?.imp?.select(p.selId, false) }, [p.selId, ready, front])
  useEffect(() => { for (const i of [0, 1]) win(i)?.imp?.pins(p.pins) }, [p.pins, ready])
  useEffect(() => { for (const i of [0, 1]) win(i)?.imp?.marks(p.marks) }, [p.marks, ready])
  useEffect(() => { if (ready[0] && ready[1] && lastDoc.current) swapRender(lastDoc.current, spread === '2') }, [spread])

  const warnText = (w: Warn) => w.kind === 'lunga'
    ? `p. ${w.page} · ${w.title || 'pagina'} · il contenuto non ci sta (resta fuori circa il ${Math.round((w.fill - 1) * 100)}%)`
    : `p. ${w.page} · ${w.title || 'sezione'} · occupata al ${Math.round(w.fill * 100)}%`
  const long = p.warnings.some(w => w.kind === 'lunga')

  return (
    <>
      <div className="pv__bar">
        {p.busy ? (<><span className="pv__info">{p.fitting ? (p.brochure ? 'Divido le pagine troppo piene…' : 'Compatto le sezioni…') : 'Impagino…'}</span><div className="progress progress--quiet"><i /></div></>)
          : <span className="pv__info">{p.info}</span>}
        {!p.busy && p.onRecompose && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={p.onRecompose} title="Stesso contenuto, scelte di impaginazione diverse. Le pagine impostate a mano restano come sono."><Icon name="shuffle" />Un'altra impaginazione</button>}
        {!p.busy && p.stale && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={p.onRefresh}><Icon name="refresh" />Aggiorna ora</button>}
        {p.warnings.length > 0 && !p.busy && (
          <button className="oe-badge oe-badge--warning" style={{ border: 0, cursor: 'pointer' }} onClick={() => setShowWarns(v => !v)} aria-expanded={showWarns}>
            {long ? `${p.warnings.length} ${p.warnings.length === 1 ? 'pagina troppo piena' : 'pagine troppo piene'}` : `${p.warnings.length} ${p.warnings.length === 1 ? 'pagina quasi vuota' : 'pagine quasi vuote'}`}
          </button>
        )}
        <div className="pv__zoom"><Segment label="Vista" value={spread} onChange={setSpread} options={[{ v: '1', l: 'Una pagina' }, { v: '2', l: 'Due pagine' }]} /></div>
        {showWarns && p.warnings.length > 0 && (
          <div className="warns">
            <p className="hint">{long
              ? 'In queste pagine il contenuto non entra (bordo tratteggiato nell\'anteprima). Posso dividerle in due pagine, senza tagliare il testo; oppure accorcia il testo o scegli un altro tipo di pagina.'
              : 'Queste sezioni finiscono con poche righe da sole su una pagina. Puoi compattarle (meno spazio tra paragrafi) o accorciare il testo.'}</p>
            {p.warnings.map(w => (
              <div className="warn" key={w.section}>
                <span>{warnText(w)}</span>
                <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => p.onGoSection(w.section)}>Vai</button>
              </div>
            ))}
            <div><button className="oe-btn oe-btn--secondary oe-btn--sm" disabled={p.busy} onClick={p.onFit}><Icon name="compress" />{p.brochure ? 'Dividi le pagine troppo piene' : 'Compatta in automatico'}</button></div>
          </div>
        )}
      </div>
      <div className="pv__stack" ref={wrap}>
        {[0, 1].map(i => (
          <iframe key={i} ref={frames[i]} className={`pv__frame${front === i ? ' is-front' : ' is-back'}`} title={front === i ? 'Anteprima delle pagine' : 'Anteprima in preparazione'}
            aria-hidden={front !== i} tabIndex={front === i ? 0 : -1}
            src={`${BASE}viewer.html`} onLoad={() => setReady(r => { const n = [...r]; n[i] = true; return n })} />
        ))}
        {p.overlay}
      </div>
    </>
  )
})
export default LivePreview
