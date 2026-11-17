import type { ReactNode } from 'react'
import Wordmark from '@ds/components/Wordmark'
import { go, useSession } from '../App'
import { Icon, Menu, initials } from './ui'

/** Barra in alto del DS (.oe-topbar, filetto lime): logo che porta al sito, titolo, comandi a destra. */
export default function TopBar({ eyebrow, title, children }: { eyebrow: ReactNode; title: ReactNode; children?: ReactNode }) {
  const { me } = useSession()
  return (
    <header className="app-top">
      <div className="oe-topbar">
        <a className="oe-logo-link app-top__logo" href="https://www.openeconomics.eu" target="_blank" rel="noopener" aria-label="OpenEconomics (apre il sito)">
          <Wordmark />
        </a>
        <span className="app-top__sep" />
        <div className="app-top__crumb">
          <span className="oe-topbar__eyebrow">{eyebrow}</span>
          <h1 className="oe-topbar__title app-top__title">{title}</h1>
        </div>
        <div className="app-top__actions">
          {children}
          <Menu button={(_, t) => <button className="iconbtn" onClick={t} aria-label={`Profilo di ${me.name}`}><span className="avatar">{initials(me.name)}</span></button>}>
            {close => (
              <>
                <div className="menu__head">{me.name}</div>
                <button className="menu__item" onClick={() => { close(); go('/') }}>Documenti</button>
                <button className="menu__item" onClick={() => { close(); go('/persone') }}>Il tuo nome e i colleghi<small>per firmare e per le @menzioni</small></button>
              </>
            )}
          </Menu>
        </div>
      </div>
    </header>
  )
}
