import { useState, type ReactElement } from 'react'
import { assetUrl } from '../api'
import type { TableBlock, View } from '../types'
import { Icon } from '../ui/ui'
import { AssetGridPicker } from './ImagePicker'
import { VIEWS } from './store'

/* schemi delle forme (stilizzati, colore accento) */
const SKETCH: Record<View, ReactElement> = {
  tabella: <g><path d="M2 5h96M2 13h96M2 21h96" strokeWidth="1" /><path d="M2 5h96" strokeWidth="2" /></g>,
  kpi: <g><path d="M2 3h28M36 3h28M70 3h28" strokeWidth="1.5" /><text x="2" y="18" fontSize="12" fill="currentColor" stroke="none" fontFamily="serif">12</text><text x="36" y="18" fontSize="12" fill="currentColor" stroke="none" fontFamily="serif">34</text><text x="70" y="18" fontSize="12" fill="currentColor" stroke="none" fontFamily="serif">5,6</text></g>,
  timeline: <g><path d="M4 4v20" strokeWidth="1" /><rect x="2" y="3" width="4" height="4" fill="currentColor" stroke="none" /><rect x="2" y="12" width="4" height="4" fill="currentColor" stroke="none" /><rect x="2" y="21" width="4" height="4" fill="#B9FF69" stroke="none" /><path d="M14 5h40M14 14h56M14 23h30" strokeWidth="1.5" /></g>,
  valori: <g><path d="M2 3h96M2 14h96" strokeWidth="1" /><path d="M2 9h22M2 20h22" strokeWidth="3" /><path d="M34 8h60M34 19h50" strokeWidth="1" /></g>,
  elenco: <g><rect x="2" y="3" width="8" height="8" fill="currentColor" stroke="none" /><rect x="36" y="3" width="8" height="8" fill="currentColor" stroke="none" /><rect x="70" y="3" width="8" height="8" fill="currentColor" stroke="none" /><path d="M2 18h26M36 18h26M70 18h26M2 23h20M36 23h20M70 23h20" strokeWidth="1" /></g>,
  barre: <g><path d="M30 5h66" strokeWidth="5" /><path d="M30 14h44" strokeWidth="5" /><path d="M30 23h24" strokeWidth="5" /><path d="M2 5h20M2 14h20M2 23h20" strokeWidth="1" /></g>,
  segmenti: <g><rect x="2" y="4" width="46" height="9" fill="currentColor" stroke="none" /><rect x="49" y="4" width="28" height="9" fill="#6E1AFF" stroke="none" /><rect x="78" y="4" width="20" height="9" fill="#A16AFF" stroke="none" /><path d="M2 21h20M30 21h20M58 21h20" strokeWidth="1" /></g>,
  codici: <g><path d="M2 3h46M52 3h46M2 15h46M52 15h46" strokeWidth="1" /><path d="M2 8h14M52 8h14M2 20h14M52 20h14" strokeWidth="2.5" /></g>,
}

export default function TableEditor({ b, set, canEdit }: { b: TableBlock; set: (fn: (b: TableBlock) => void) => void; canEdit: boolean }) {
  const [iconRow, setIconRow] = useState<number | null>(null)
  const info = VIEWS.find(v => v.v === b.view)!
  const nc = Math.max(1, ...b.rows.map(r => r.length))
  const firstData = b.header ? 1 : 0 // le icone si contano dalle righe di dati
  const cell = (ri: number, ci: number, v: string) => set(t => { while (t.rows[ri]!.length <= ci) t.rows[ri]!.push(''); t.rows[ri]![ci] = v })

  return (
    <>
      <div className="oe-field">
        <span className="oe-label">Forma</span>
        <div className="view-grid">
          {VIEWS.map(v => (
            <button key={v.v} type="button" disabled={!canEdit} className={`view-opt${b.view === v.v ? ' is-active' : ''}`} onClick={() => set(t => { t.view = v.v })}>
              <svg viewBox="0 0 100 28" fill="none" stroke="currentColor" aria-hidden>{SKETCH[v.v]}</svg>{v.l}
            </button>
          ))}
        </div>
        <span className="hint">{info.help} Colonne lette: <b>{info.cols}</b>.</span>
      </div>
      <label className="oe-field">
        <span className="oe-label">Titolo del box (facoltativo)</span>
        <input className="oe-input" disabled={!canEdit} value={b.caption} onChange={e => set(t => { t.caption = e.target.value })} />
      </label>
      <label className="oe-check">
        <input type="checkbox" disabled={!canEdit} checked={b.header} onChange={e => set(t => { t.header = e.target.checked })} />
        {b.view === 'tabella' ? 'La prima riga è l\'intestazione' : 'Salta la prima riga (intestazione)'}
      </label>
      <div className="oe-field">
        <span className="oe-label">Dati</span>
        <div className="tbled">
          <table>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className={b.header && ri === 0 ? 'is-head' : ''}>
                  {b.view === 'elenco' && (
                    <td className="tbled__ctl">
                      {ri >= firstData && (
                        <button className="tbled__x" disabled={!canEdit} title="Icona del design system" aria-label={`Icona della riga ${ri + 1}`} onClick={() => setIconRow(ri - firstData)}>
                          {b.icons[ri - firstData] ? <img src={assetUrl(b.icons[ri - firstData]!)} alt="" style={{ width: 20, height: 20 }} /> : '＋'}
                        </button>
                      )}
                    </td>
                  )}
                  {Array.from({ length: nc }).map((_, ci) => (
                    <td key={ci}><textarea rows={1} disabled={!canEdit} value={r[ci] ?? ''} aria-label={`Riga ${ri + 1}, colonna ${ci + 1}`} onChange={e => cell(ri, ci, e.target.value)} /></td>
                  ))}
                  <td className="tbled__ctl">{canEdit && <button className="tbled__x" title="Elimina riga" aria-label={`Elimina riga ${ri + 1}`} onClick={() => set(t => { t.rows.splice(ri, 1) })}>×</button>}</td>
                </tr>
              ))}
              {canEdit && (
                <tr>
                  {b.view === 'elenco' && <td className="tbled__ctl" />}
                  {Array.from({ length: nc }).map((_, ci) => (
                    <td key={ci} className="tbled__ctl" style={{ width: 'auto' }}>
                      <button className="tbled__x" title="Elimina colonna" aria-label={`Elimina colonna ${ci + 1}`} onClick={() => set(t => { t.rows.forEach(r => r.splice(ci, 1)) })} disabled={nc <= 1}>×</button>
                    </td>
                  ))}
                  <td className="tbled__ctl" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div className="insp__actions">
            <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => set(t => { t.rows.push(Array(nc).fill('')) })}><Icon name="plus" />Riga</button>
            <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => set(t => { t.rows.forEach(r => r.push('')) })}><Icon name="plus" />Colonna</button>
          </div>
        )}
      </div>
      {iconRow !== null && (
        <AssetGridPicker kind="icona" title="Icona del design system" value={b.icons[iconRow] ?? null} onClose={() => setIconRow(null)}
          onPick={id => { set(t => { while (t.icons.length <= iconRow) t.icons.push(null); t.icons[iconRow] = id }); setIconRow(null) }} />
      )}
    </>
  )
}
