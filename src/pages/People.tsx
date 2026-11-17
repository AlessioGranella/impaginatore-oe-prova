import { useState } from 'react'
import { useSession } from '../App'
import { addTeam, myName, removeTeam, setMyName, team } from '../local/backend'
import TopBar from '../ui/TopBar'
import { Icon, initials, useToast } from '../ui/ui'

/** Versione senza server: il nome di chi usa il tool e l'elenco dei colleghi da citare con @. */
export default function People() {
  const { refresh } = useSession()
  const toast = useToast()
  const [list, setList] = useState(team())
  const [me, setMe] = useState(myName())
  const [add, setAdd] = useState('')
  return (
    <>
      <TopBar eyebrow="Layout Designer" title="Persone" />
      <main className="page" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 48 }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="page-head__text">
            <span className="oe-tag-chip oe-tag-chip--lime" style={{ alignSelf: 'flex-start' }}>Team</span>
            <h1 style={{ fontSize: 40 }}>Colleghi da citare nei commenti</h1>
            <p>Scrivendo @ in un commento compaiono questi nomi. I nomi di chi ha salvato o commentato un file .oe aperto qui si aggiungono da soli.</p>
          </div>
          <div className="oe-table__wrap">
            <table className="oe-table">
              <thead><tr><th>Nome</th><th><span className="sr-only">Azioni</span></th></tr></thead>
              <tbody>{list.map(n => (
                <tr key={n}><td style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="avatar avatar--sm">{initials(n)}</span>{n}</td>
                  <td style={{ textAlign: 'right' }}>{n !== myName() && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => { removeTeam(n); setList(team()) }}>Togli</button>}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <form className="oe-card" onSubmit={e => { e.preventDefault(); if (add.trim().length > 1) { addTeam([add]); setList(team()); setAdd('') } }}>
            <h2 className="oe-card__title">Aggiungi un collega</h2>
            <label className="oe-field"><span className="oe-label">Nome e cognome</span><input className="oe-input" value={add} onChange={e => setAdd(e.target.value)} /></label>
            <div><button className="oe-btn oe-btn--primary oe-btn--md">Aggiungi <Icon name="arrow" /></button></div>
          </form>
        </section>
        <form className="oe-card" style={{ alignSelf: 'start' }} onSubmit={e => { e.preventDefault(); if (me.trim().length > 1) { setMyName(me); refresh(); setList(team()); toast('Nome aggiornato') } }}>
          <h2 className="oe-card__title">Il tuo nome</h2>
          <label className="oe-field"><span className="oe-label">Nome e cognome</span><input className="oe-input" value={me} onChange={e => setMe(e.target.value)} /></label>
          <p className="hint">Vale per le prossime versioni e i prossimi commenti; quelli già fatti restano firmati come prima.</p>
          <div><button className="oe-btn oe-btn--primary oe-btn--md">Salva</button></div>
        </form>
      </main>
    </>
  )
}
