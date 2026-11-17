import { useEffect, useRef, useState } from 'react'
import { aiKey, applyChanges, askEdit, setAiKey, type Focus } from '../local/ai'
import type { Doc } from '../types'
import { Icon } from '../ui/ui'

const ESEMPI_BILANCIO = ['Accorcia questa sezione di un terzo senza perdere i numeri', 'Trasforma questo elenco in un box a riquadri', 'Correggi 2024 in 2025 in tutto il documento']
const ESEMPI_BROCHURE = ['Fai diventare questa pagina una pagina a card', 'Riscrivi il titolo in modo più breve', 'Dividi questo testo in quattro voci con un titoletto']

/** Modifiche scritte a parole: il punto selezionato (o la frase) è il bersaglio; il risultato va nella bozza e si annulla con ⌘Z. */
export default function AiPanel({ doc, focus, onApply, canEdit, prefill, clearPrefill }: {
  doc: Doc; focus: Focus; canEdit: boolean
  onApply: (d: Doc, touched: string[], summary: string) => void
  prefill: string | null; clearPrefill: () => void
}) {
  const [key, setKey] = useState(aiKey())
  const [draftKey, setDraftKey] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ summary: string; n: number; skipped: number } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (prefill !== null) { ta.current?.focus(); clearPrefill() } }, [prefill])

  const run = async () => {
    if (!text.trim()) return
    setBusy(true); setErr(''); setDone(null)
    abort.current = new AbortController()
    try {
      const r = await askEdit(doc, text.trim(), focus, abort.current.signal)
      const a = applyChanges(doc, r.changes)
      if (a.touched.length) onApply(a.doc, a.touched, r.summary)
      setDone({ summary: r.summary, n: a.touched.length, skipped: a.skipped.length })
      if (a.touched.length) setText('')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  if (!key) return (
    <div className="ai">
      <h3 className="ai__h">Modifiche scritte a parole</h3>
      <p>Scrivi cosa vuoi cambiare («accorcia questa sezione», «metti questi numeri in card») e Claude modifica il documento. Il risultato finisce nella bozza: lo controlli, lo annulli con ⌘Z o lo salvi come versione.</p>
      <label className="oe-field"><span className="oe-label">Chiave API di Anthropic</span>
        <input className="oe-input" type="password" autoComplete="off" value={draftKey} onChange={e => setDraftKey(e.target.value)} placeholder="sk-ant-…" /></label>
      <p className="hint">La chiave resta solo in questo browser e va solo ad api.anthropic.com. La crea chi gestisce l'account Anthropic di OpenEconomics su console.anthropic.com; ogni richiesta ha un costo, di solito pochi centesimi.</p>
      <div><button className="oe-btn oe-btn--primary oe-btn--sm" disabled={!draftKey.trim().startsWith('sk-')} onClick={() => { setAiKey(draftKey); setKey(aiKey()) }}>Salva la chiave <Icon name="arrow" /></button></div>
    </div>
  )

  const esempi = doc.meta.kind === 'brochure' ? ESEMPI_BROCHURE : ESEMPI_BILANCIO
  return (
    <div className="ai">
      <span className="oe-label">Cosa cambio?</span>
      <div className="cm-anchor">
        {focus.id ? <>Su: {focus.label}{focus.quote && <> · «{focus.quote.length > 90 ? focus.quote.slice(0, 89) + '…' : focus.quote}»</>}</> : 'Sul documento intero. Per cambiare un punto preciso cliccalo (o seleziona una frase) nella pagina.'}
      </div>
      <textarea ref={ta} className="oe-textarea" style={{ minHeight: 110 }} value={text} disabled={!canEdit || busy}
        placeholder="Es.: rendi il primo paragrafo più breve e metti in grassetto i numeri"
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run() } }} aria-label="Richiesta di modifica" />
      {!text && <div className="ai__ex">{esempi.map(x => <button key={x} className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => setText(x)}>{x}</button>)}</div>}
      <div className="insp__actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="hint">⌘+Invio per mandare</span>
        {busy
          ? <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={() => abort.current?.abort()}>Interrompi</button>
          : <button className="oe-btn oe-btn--primary oe-btn--sm" disabled={!canEdit || !text.trim()} onClick={run}>Modifica <Icon name="arrow" /></button>}
      </div>
      {busy && <><div className="progress"><i /></div><p className="hint">Claude sta lavorando sul documento: di solito servono da 10 a 40 secondi.</p></>}
      {err && <div className="form-error" role="alert">{err}</div>}
      {done && (
        <div className={`ai__done${done.n ? '' : ' is-empty'}`} role="status">
          <b>{done.n ? `Fatto: ${done.n} ${done.n === 1 ? 'punto cambiato' : 'punti cambiati'}` : 'Nessuna modifica'}</b>
          <p>{done.summary}</p>
          {done.n > 0 && <p className="hint">La modifica è nella bozza. Se non ti convince premi ⌘Z; se va bene, «Salva versione».</p>}
          {done.skipped > 0 && <p className="hint">{done.skipped} modifiche indicavano punti che non esistono e non le ho applicate.</p>}
        </div>
      )}
      <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => { if (confirm('Togliere la chiave API da questo browser?')) { setAiKey(''); setKey('') } }}>Togli la chiave API da questo browser</button>
    </div>
  )
}
