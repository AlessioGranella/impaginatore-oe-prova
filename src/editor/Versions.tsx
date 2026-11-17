import { useEffect, useState } from 'react'
import { api, fmtDate } from '../api'
import type { DocFull, Role, User, VersionRow } from '../types'
import { Icon, Modal, initials, useToast } from '../ui/ui'

export function Versions({ docId, head, viewing, onView, onRestore, onDownload, canEdit, dirty, refreshKey }: {
  docId: string; head: number; viewing: number | null; onView: (n: number | null) => void; onRestore: (n: number) => void
  onDownload: (n: number, kind: 'digitale' | 'stampa') => void; canEdit: boolean; dirty: boolean; refreshKey: number
}) {
  const [rows, setRows] = useState<VersionRow[]>([])
  useEffect(() => { api.get<VersionRow[]>(`/documents/${docId}/versions`).then(setRows) }, [docId, head, refreshKey])
  return (
    <>
      <p className="hint">Ogni «Salva versione» crea una nuova versione. Le precedenti non si perdono: puoi guardarle, scaricarle o ripristinarle (il ripristino crea una versione nuova).</p>
      <div className="vlist">
        {rows.map(v => (
          <div className="vrow" key={v.number}>
            <span className="vrow__n">{v.number}</span>
            <div className="vrow__body">
              <span className="vrow__msg">{v.message || <span style={{ color: 'var(--oe-fg-soft)' }}>Senza descrizione</span>}</span>
              <span className="vrow__meta">{v.author} · {fmtDate(v.created_at)}{v.number === head ? ' · attuale' : ''}</span>
              <div className="vrow__act">
                {v.number !== head && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => onView(viewing === v.number ? null : v.number)}><Icon name="eye" />{viewing === v.number ? 'Chiudi' : 'Guarda'}</button>}
                <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => onDownload(v.number, 'digitale')}><Icon name="download" />PDF</button>
                {canEdit && v.number !== head && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => {
                  if (confirm(dirty ? `Hai modifiche non salvate: andranno perse. Ripristinare la versione ${v.number}?` : `Ripristinare la versione ${v.number}? Diventa la versione ${head + 1}.`)) onRestore(v.number)
                }}><Icon name="history" />Ripristina</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

const ROLES: { v: Role; l: string }[] = [
  { v: 'modifica', l: 'Può modificare' }, { v: 'commento', l: 'Può commentare' }, { v: 'proprietario', l: 'Proprietario' },
]

export function ShareModal({ doc, users, onClose, onChanged, isOwner }: { doc: DocFull; users: User[]; onClose: () => void; onChanged: () => void; isOwner: boolean }) {
  const toast = useToast()
  const [pick, setPick] = useState('')
  const [role, setRole] = useState<Role>('modifica')
  const others = users.filter(u => !doc.members.some(m => m.id === u.id))
  const add = async () => {
    if (!pick) return
    try { await api.post(`/documents/${doc.id}/members`, { user_id: pick, role }); setPick(''); onChanged() } catch (e) { toast((e as Error).message, true) }
  }
  const change = async (uid: string, r: Role) => { try { await api.post(`/documents/${doc.id}/members`, { user_id: uid, role: r }); onChanged() } catch (e) { toast((e as Error).message, true) } }
  const remove = async (uid: string) => { try { await api.del(`/documents/${doc.id}/members/${uid}`); onChanged() } catch (e) { toast((e as Error).message, true) } }
  return (
    <Modal title="Condividi" onClose={onClose} foot={<button className="oe-btn oe-btn--secondary oe-btn--md" onClick={onClose}>Fatto</button>}>
      {isOwner && (
        <div className="form-row" style={{ gridTemplateColumns: '1fr auto auto', alignItems: 'end' }}>
          <label className="oe-field"><span className="oe-label">Aggiungi una persona del team</span>
            <select className="oe-select" value={pick} onChange={e => setPick(e.target.value)}>
              <option value="">Scegli…</option>
              {others.map(u => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
            </select></label>
          <select className="oe-select" aria-label="Ruolo" value={role} onChange={e => setRole(e.target.value as Role)}>
            {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
          <button className="oe-btn oe-btn--primary oe-btn--md" disabled={!pick} onClick={add}>Aggiungi</button>
        </div>
      )}
      <div className="mlist">
        {doc.members.map(m => (
          <div className="mrow" key={m.id}>
            <span className="avatar avatar--sm">{initials(m.name)}</span>
            <span className="mrow__name">{m.name}<small>{m.email}</small></span>
            {isOwner ? (
              <>
                <select className="oe-select" aria-label={`Ruolo di ${m.name}`} value={m.role} onChange={e => change(m.id, e.target.value as Role)}>
                  {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
                <button className="iconbtn" aria-label={`Togli ${m.name}`} onClick={() => remove(m.id)}><Icon name="close" /></button>
              </>
            ) : <span className="hint">{ROLES.find(r => r.v === m.role)?.l}</span>}
          </div>
        ))}
      </div>
      <p className="hint">Chi viene citato con @ in un commento riceve l'accesso in sola lettura con commenti, se non ce l'ha già.</p>
    </Modal>
  )
}
