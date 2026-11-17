import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/* ----------------------------------------------------------- icone d'interfaccia (tratto singolo, griglia 24) */
const P: Record<string, ReactNode> = {
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 20h4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  copy: <path d="M8 8h11v11H8zM5 16V5h11" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  share: <path d="M16 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM10.6 13.5l2.8 1.8M13.4 6.7l-2.8 1.8" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  comment: <path d="M4 5h16v11H9l-5 4V5Z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  image: <path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01" />,
  shuffle: <path d="M3 7h4l9 10h5M3 17h4l2.6-3M13.4 10 16 7h5M18 4l3 3-3 3M18 14l3 3-3 3" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />,
  check: <path d="m5 12 5 5 9-10" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3" />,
  doc: <path d="M6 3h9l4 4v14H6zM14 3v5h5" />,
  compress: <path d="M4 9h16M4 15h16M12 3v4M12 21v-4M9 5l3 2 3-2M9 19l3-2 3 2" />,
  eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
}
export function Icon({ name, title }: { name: keyof typeof P | string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {P[name]}
    </svg>
  )
}

/* ----------------------------------------------------------- finestra */
export function Modal({ title, onClose, children, foot, wide }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Chiudi"><Icon name="close" /></button>
        </div>
        <div className="modal__body">{children}</div>
        {foot && <div className="modal__foot">{foot}</div>}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- menu a tendina */
export function Menu({ button, children, panelClass = '' }: { button: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; panelClass?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h)
    window.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k) }
  }, [open])
  return (
    <div className="menu" ref={ref}>
      {button(open, () => setOpen(o => !o))}
      {open && <div className={`menu__panel ${panelClass}`} role="menu">{children(() => setOpen(false))}</div>}
    </div>
  )
}

/* ----------------------------------------------------------- avvisi brevi */
type ToastT = { text: string; err?: boolean } | null
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastT>(null)
  const timer = useRef<number>(0)
  const show = useCallback((text: string, err = false) => {
    setT({ text, err })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setT(null), err ? 7000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={`toast${t.err ? ' toast--err' : ''}`} role="status">{t.text}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('')
}

export function Segment<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; l: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="oe-segment" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} disabled={o.disabled}
          className={`oe-segment__btn${o.v === value ? ' is-active' : ''}`} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  )
}
