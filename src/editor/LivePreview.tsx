import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { buildHtml, FORMATS, imageNeeds } from '../local/engine'
import { prepareImages } from '../local/images'
import type { Doc } from '../types'
import type { Pin, ViewerApi, Warn } from '../viewer/main'
import { Icon, Segment } from '../ui/ui'

export type { Pin, Warn }
export interface RenderOut { pages: number; warnings: Warn[]; ms: number }
export interface LivePreviewHandle {
  render(doc: Doc): Promise<RenderOut>
  print(doc: Doc, mode: 'digital' | 'print'): Promise<void>
}

const BASE = import.meta.env.BASE_URL
const assetBase = () => new URL(`${BASE}render/`, location.href).href

/** Anteprima dal vivo: il documento viene impaginato nel browser (Vivliostyle, dentro un iframe). */
const LivePreview = forwardRef<LivePreviewHandle, {
  selId: string | null; onPick: (id: string) => void; pins: Pin[]; onPin: (threadId: string) => void
  busy: boolean; info: string; stale: boolean; warnings: Warn[]; onFit: () => void; fitting: boolean; onGoSection: (id: string) => void; onRefresh: () => void
}>(function LivePreview(p, ref) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [spread, setSpread] = useState<'1' | '2'>('1')
  const [showWarns, setShowWarns] = useState(false)
  const lastDoc = useRef<Doc | null>(null)
  const win = () => frame.current?.contentWindow as (Window & { imp?: ViewerApi }) | null
  const waitApi = async () => { for (let i = 0; i < 200; i++) { const a = win()?.imp; if (a) return a; await new Promise(r => setTimeout(r, 50)) } throw new Error('Anteprima non pronta') }

  const run = async (doc: Doc, mode: 'digital' | 'print', ppi: number, keepScroll: boolean, spreadMode: boolean) => {
    const a = await waitApi()
    const F = FORMATS[doc.meta.format] ?? FORMATS.a4v
    const imgs = await prepareImages(imageNeeds(doc), ppi)
    const html = buildHtml(doc, mode, imgs, assetBase())
    const sections = doc.chapters.flatMap(c => c.sections.filter(s => s.layout?.mode !== 'highlights').map(s => ({ id: s.id, title: s.title, blocks: s.blocks.map(b => b.id), tight: Number(s.layout?.tight || 0) })))
    return a.render(html, { sections, contentTop: F.MT / F.PH, contentH: (F.PH - F.MT - F.MB) / F.PH, spread: spreadMode, keepScroll })
  }

  useImperativeHandle(ref, () => ({
    async render(doc) { lastDoc.current = doc; return run(doc, 'digital', 150, true, spread === '2') },
    async print(doc, mode) {
      // immagini a 300 ppi per il PDF, poi si torna all'anteprima
      await run(doc, mode, 300, false, false)
      const a = await waitApi()
      await new Promise<void>(res => {
        const w = win()!
        const after = () => { w.removeEventListener('afterprint', after); res() }
        w.addEventListener('afterprint', after)
        a.print()
        setTimeout(res, 120000)
      })
      if (lastDoc.current) await run(lastDoc.current, 'digital', 150, true, spread === '2')
    },
  }), [spread])

  useEffect(() => {
    const a = win()?.imp
    if (!a) return
    a.onPick = p.onPick
    a.onPin = p.onPin
  })
  useEffect(() => { win()?.imp?.select(p.selId, true) }, [p.selId, ready])
  useEffect(() => { win()?.imp?.pins(p.pins) }, [p.pins, ready])
  useEffect(() => { if (ready && lastDoc.current) run(lastDoc.current, 'digital', 150, true, spread === '2') }, [spread])

  return (
    <>
      <div className="pv__bar">
        {p.busy ? (<><span className="pv__info">{p.fitting ? 'Compatto le sezioni…' : 'Impagino…'}</span><div className="progress"><i /></div></>)
          : <span className="pv__info">{p.info}</span>}
        {!p.busy && p.stale && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={p.onRefresh}><Icon name="refresh" />Aggiorna ora</button>}
        {p.warnings.length > 0 && !p.busy && (
          <button className="oe-badge oe-badge--warning" style={{ border: 0, cursor: 'pointer' }} onClick={() => setShowWarns(v => !v)} aria-expanded={showWarns}>
            {p.warnings.length} {p.warnings.length === 1 ? 'pagina quasi vuota' : 'pagine quasi vuote'}
          </button>
        )}
        <div className="pv__zoom"><Segment label="Vista" value={spread} onChange={setSpread} options={[{ v: '1', l: 'Una pagina' }, { v: '2', l: 'Due pagine' }]} /></div>
        {showWarns && p.warnings.length > 0 && (
          <div className="warns">
            <p className="hint">Queste sezioni finiscono con poche righe da sole su una pagina. Puoi compattarle (meno spazio tra paragrafi) o accorciare il testo.</p>
            {p.warnings.map(w => (
              <div className="warn" key={w.section}>
                <span>p. {w.page} · {w.title || 'sezione'} · occupata al {Math.round(w.fill * 100)}%</span>
                <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => p.onGoSection(w.section)}>Vai</button>
              </div>
            ))}
            <div><button className="oe-btn oe-btn--secondary oe-btn--sm" disabled={p.busy} onClick={p.onFit}><Icon name="compress" />Compatta in automatico</button></div>
          </div>
        )}
      </div>
      <iframe ref={frame} className="pv__frame" title="Anteprima delle pagine" src={`${BASE}viewer.html`} onLoad={() => setReady(true)} />
    </>
  )
})
export default LivePreview
