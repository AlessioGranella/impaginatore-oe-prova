import type { Doc } from '../types'
import { Icon } from '../ui/ui'
import { newChapter, type Sel } from './store'

export default function Outline({ doc, sel, setSel, counts, canEdit, update }: {
  doc: Doc; sel: Sel; setSel: (s: Sel) => void; counts: Record<string, number>; canEdit: boolean; update: (fn: (d: Doc) => void) => void
}) {
  const active = (k: string, id?: string) => sel?.kind === k && (!id || ('id' in sel && sel.id === id))
  return (
    <nav aria-label="Struttura del documento">
      <div className="ol__title">Struttura</div>
      <button className={`ol__item${active('cover') ? ' is-active' : ''}`} onClick={() => setSel({ kind: 'cover' })}>Copertina e sommario</button>
      {doc.chapters.map((ch, ci) => (
        <div key={ch.id}>
          <button className={`ol__item ol__item--ch${active('chapter', ch.id) ? ' is-active' : ''}`} onClick={() => setSel({ kind: 'chapter', id: ch.id })}>
            <span className="ol__num">{String(ci + 1).padStart(2, '0')}</span>{ch.title || 'Capitolo'}
          </button>
          {ch.sections.map(s => (
            <button key={s.id} className={`ol__item ol__item--sec${active('section', s.id) ? ' is-active' : ''}`} onClick={() => setSel({ kind: 'section', id: s.id })}>
              <span>{s.title || <i style={{ fontStyle: 'normal', color: 'var(--oe-gray-500)' }}>Senza titolo</i>}</span>
              {counts[s.id] ? <span className="ol__count" title={`${counts[s.id]} commenti aperti`}>{counts[s.id]}</span> : null}
            </button>
          ))}
        </div>
      ))}
      {canEdit && (
        <div className="ol__add">
          <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ padding: 0 }} onClick={() => { const c = newChapter(); update(d => { d.chapters.push(c) }); setSel({ kind: 'chapter', id: c.id }) }}>
            <Icon name="plus" />Nuovo capitolo
          </button>
        </div>
      )}
    </nav>
  )
}
