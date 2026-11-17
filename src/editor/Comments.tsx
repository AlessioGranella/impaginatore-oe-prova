import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ago, api } from '../api'
import { useSession } from '../App'
import type { Comment, Doc, User } from '../types'
import { Icon, Segment, initials, useToast } from '../ui/ui'
import { blockExcerpt, blockLabel, locate } from './store'

export default function Comments({ docId, doc, comments, users, anchor, setAnchor, active, setActive, reload, onGoTo }: {
  docId: string; doc: Doc; comments: Comment[]; users: User[]; anchor: string | null; setAnchor: (id: string | null) => void
  active: string | null; setActive: (id: string | null) => void; reload: () => void; onGoTo: (blockId: string) => void
}) {
  const [filter, setFilter] = useState<'aperti' | 'risolti' | 'tutti'>('aperti')
  const roots = comments.filter(c => !c.parent_id)
  const shown = roots.filter(c => filter === 'tutti' || (filter === 'aperti' ? !c.resolved : c.resolved)).reverse()
  const where = (blockId: string | null) => {
    if (!blockId) return 'Documento'
    if (blockId === 'cover') return 'Copertina'
    const w = locate(doc, blockId)
    if (!w) return 'Contenuto non più presente'
    if (w.block) return `${w.sec?.title || w.ch.title} · ${blockLabel(w.block)}`
    return w.sec?.title || w.ch.title
  }
  useEffect(() => {
    if (!active) return
    document.getElementById(`th-${active}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  const anchorText = anchor ? (() => { const w = locate(doc, anchor); return w?.block ? blockExcerpt(w.block, 90) : where(anchor) })() : null
  return (
    <>
      <div className="cm-new">
        <span className="oe-label">Nuovo commento</span>
        {anchor ? (
          <div className="cm-anchor">Su: {anchorText} <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ padding: 0, marginLeft: 8 }} onClick={() => setAnchor(null)}>generale</button></div>
        ) : <div className="cm-anchor">Sul documento in generale. Per commentare un punto preciso cliccalo nell'anteprima.</div>}
        <Composer docId={docId} users={users} anchor={anchor} onSent={reload} placeholder="Scrivi un commento. Con @ citi un collega: riceve una notifica." />
      </div>
      <Segment label="Filtro commenti" value={filter} onChange={setFilter}
        options={[{ v: 'aperti', l: `Aperti (${roots.filter(c => !c.resolved).length})` }, { v: 'risolti', l: 'Risolti' }, { v: 'tutti', l: 'Tutti' }]} />
      {shown.length === 0 && <p className="hint">{filter === 'aperti' ? 'Nessun commento aperto.' : 'Nessun commento.'}</p>}
      {shown.map(c => (
        <Thread key={c.id} root={c} replies={comments.filter(r => r.parent_id === c.id)} where={where(c.block_id)} users={users} docId={docId}
          active={active === c.id} onClick={() => { setActive(c.id); if (c.block_id) onGoTo(c.block_id) }} reload={reload} />
      ))}
    </>
  )
}

function Thread({ root, replies, where, users, docId, active, onClick, reload }: {
  root: Comment; replies: Comment[]; where: string; users: User[]; docId: string; active: boolean; onClick: () => void; reload: () => void
}) {
  const { me } = useSession()
  const toast = useToast()
  const [reply, setReply] = useState(false)
  const resolve = (v: boolean) => api.patch(`/comments/${root.id}`, { resolved: v }).then(reload).catch(e => toast(e.message, true))
  const del = (c: Comment) => { if (confirm('Eliminare il commento?')) api.del(`/comments/${c.id}`).then(reload).catch(e => toast(e.message, true)) }
  return (
    <article id={`th-${root.id}`} className={`thread${active ? ' is-sel' : ''}${root.resolved ? ' is-resolved' : ''}`} onClick={onClick}>
      <div className="cm__where">{where}</div>
      <One c={root} me={me.id} onDelete={() => del(root)} />
      {replies.length > 0 && <div className="thread__replies">{replies.map(r => <One key={r.id} c={r} me={me.id} onDelete={() => del(r)} />)}</div>}
      <div className="insp__actions" onClick={e => e.stopPropagation()}>
        {!root.resolved && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => setReply(v => !v)}>Rispondi</button>}
        <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => resolve(!root.resolved)}><Icon name="check" />{root.resolved ? 'Riapri' : 'Risolto'}</button>
      </div>
      {reply && <div onClick={e => e.stopPropagation()}><Composer docId={docId} users={users} anchor={root.block_id} parent={root.id} onSent={() => { setReply(false); reload() }} placeholder="Rispondi…" autoFocus /></div>}
    </article>
  )
}

function One({ c, me, onDelete }: { c: Comment; me: string; onDelete: () => void }) {
  // evidenzia le @menzioni
  const parts = c.body.split(/(@[A-ZÀ-Ý][\wÀ-ÿ'’-]*(?:\s[A-ZÀ-Ý][\wÀ-ÿ'’-]*)?)/g)
  return (
    <div className="cm">
      <span className="avatar avatar--sm">{initials(c.author)}</span>
      <div className="cm__body">
        <div className="cm__meta"><b>{c.author}</b> · {ago(c.created_at)} · v{c.version}
          {c.author_id === me && <button className="oe-btn oe-btn--ghost oe-btn--sm" style={{ padding: '0 0 0 8px', fontSize: 13 }} onClick={e => { e.stopPropagation(); onDelete() }}>elimina</button>}
        </div>
        <div className="cm__text">{parts.map((p, i) => p.startsWith('@') ? <span key={i} className="mention">{p}</span> : p)}</div>
      </div>
    </div>
  )
}

/** Campo di testo con suggerimenti @nome. */
function Composer({ docId, users, anchor, parent, onSent, placeholder, autoFocus }: {
  docId: string; users: User[]; anchor: string | null; parent?: string; onSent: () => void; placeholder: string; autoFocus?: boolean
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<Record<string, string>>({})
  const [q, setQ] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const caret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (caret.current !== null && ta.current) { ta.current.focus(); ta.current.setSelectionRange(caret.current, caret.current); caret.current = null }
  }, [text])
  const sugg = useMemo(() => q === null ? [] : users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().startsWith(q.toLowerCase())).slice(0, 6), [q, users])

  const onChange = (v: string) => {
    setText(v)
    const pos = ta.current?.selectionStart ?? v.length
    const m = v.slice(0, pos).match(/(?:^|\s)@([\wÀ-ÿ.]*)$/)
    setQ(m ? m[1]! : null)
    setIdx(0)
  }
  const pick = (u: User) => {
    const pos = ta.current?.selectionStart ?? text.length
    const before = text.slice(0, pos).replace(/@([\wÀ-ÿ.]*)$/, `@${u.name} `)
    setText(before + text.slice(pos))
    setMentions(m => ({ ...m, [u.id]: u.name }))
    setQ(null)
    caret.current = before.length
  }
  const send = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      const ids = Object.entries(mentions).filter(([, n]) => text.includes(`@${n}`)).map(([id]) => id)
      await api.post(`/documents/${docId}/comments`, { body: text, block_id: anchor, parent_id: parent, mentions: ids })
      setText(''); setMentions({})
      onSent()
      if (ids.length) toast(`Commento inviato: ${ids.length === 1 ? 'la persona citata riceve' : `le ${ids.length} persone citate ricevono`} una notifica`)
    } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (sugg.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => (i + 1) % sugg.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => (i - 1 + sugg.length) % sugg.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(sugg[idx]!); return }
      if (e.key === 'Escape') { setQ(null); return }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
  }
  return (
    <div className="cm-input">
      <textarea ref={ta} className="oe-textarea" style={{ minHeight: 72 }} value={text} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} onKeyDown={onKey} aria-label="Testo del commento" />
      {sugg.length > 0 && (
        <div className="cm-sugg" role="listbox">
          {sugg.map((u, i) => (
            <button key={u.id} role="option" aria-selected={i === idx} className={i === idx ? 'is-active' : ''} onMouseDown={e => { e.preventDefault(); pick(u) }}>
              <span className="avatar avatar--sm">{initials(u.name)}</span>{u.name} <small style={{ color: 'var(--oe-fg-soft)' }}>{u.email}</small>
            </button>
          ))}
        </div>
      )}
      <div className="insp__actions" style={{ marginTop: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="hint">⌘+Invio per inviare</span>
        <button className="oe-btn oe-btn--primary oe-btn--sm" disabled={busy || !text.trim()} onClick={send}>Invia <Icon name="arrow" /></button>
      </div>
    </div>
  )
}
