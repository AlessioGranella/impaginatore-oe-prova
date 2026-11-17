import { useState } from 'react'
import Wordmark from '@ds/components/Wordmark'
import { setMyName } from '../local/backend'

/** Versione senza server: niente accesso, solo il nome (firma versioni e commenti). */
export default function Login({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return
    setMyName(name)
    onDone()
  }
  return (
    <main className="login">
      <section className="login__side">
        <a className="oe-logo-link" href="https://www.openeconomics.eu" target="_blank" rel="noopener" aria-label="OpenEconomics"><Wordmark /></a>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <span className="oe-tag-chip oe-tag-chip--lime" style={{ alignSelf: 'flex-start' }}>OpenEconomics Layout Designer · versione di prova</span>
          <h1>Dal Word al documento impaginato, nel design system</h1>
          <p>Carichi il testo, il tool impagina. Poi correggi testi, foto e icone, salvi le versioni e commenti con il team. Tutto resta nel tuo browser: per condividere un documento si usa il suo file .oe.</p>
        </div>
        <span />
      </section>
      <section className="login__form">
        <form onSubmit={submit}>
          <h2>Come ti chiami?</h2>
          <p>Il nome firma le versioni che salvi e i commenti che scrivi, così il team sa chi ha fatto cosa. Non serve una password.</p>
          <label className="oe-field">
            <span className="oe-label">Nome e cognome</span>
            <input className="oe-input" autoFocus required minLength={2} value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          </label>
          <button className="oe-btn oe-btn--primary oe-btn--lg" disabled={name.trim().length < 2} style={{ alignSelf: 'flex-start' }}>
            Inizia
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>
      </section>
    </main>
  )
}
