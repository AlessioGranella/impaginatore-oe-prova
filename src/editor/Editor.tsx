import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import { go, useSession } from '../App'
import { team } from '../local/backend'
import { buildFile, canLink, download, fileName, linkFile, linkedName, unlink, writeLinked } from '../local/file'
import type { Comment, Doc, DocFull, User } from '../types'
import TopBar from '../ui/TopBar'
import { Icon, Menu, Modal, useToast } from '../ui/ui'
import Comments, { Composer } from './Comments'
import AiPanel from './AiPanel'
import { inline } from '../local/engine'
import Inspector from './Inspector'
import LivePreview, { type LivePreviewHandle, type Mark, type Pin, type TextSel, type Warn } from './LivePreview'
import Outline from './Outline'
import { blockExcerpt, blockLabel, clone, locate, selFromId, type Sel } from './store'
import { Versions } from './Versions'
import { PhotoDrop, PhotoReport } from './PhotoReport'
import type { Placement } from '../local/place'

type Tab = 'modifica' | 'ai' | 'commenti' | 'versioni'
/** pausa dopo l'ultima modifica prima di reimpaginare (nell'iframe nascosto: chi scrive non vede niente muoversi) */
const AUTO_PREVIEW_MS = 700

export default function Editor({ id, focusComment }: { id: string; focusComment: string | null }) {
  const toast = useToast()
  const { me } = useSession()
  const [info, setInfo] = useState<DocFull | null>(null)
  const [draft, setDraft] = useState<Doc | null>(null)
  const [head, setHead] = useState(0)
  const saved = useRef('')
  const hist = useRef<{ past: Doc[]; future: Doc[]; key: string; at: number }>({ past: [], future: [], key: '', at: 0 })
  const [, force] = useState(0)

  const [sel, setSel] = useState<Sel>(null)
  const [tab, setTab] = useState<Tab>(focusComment ? 'commenti' : 'modifica')
  const [focusNew, setFocusNew] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [activeThread, setActiveThread] = useState<string | null>(focusComment)
  const [savePop, setSavePop] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState<'' | 'digital' | 'print'>('')
  const [printHelp, setPrintHelp] = useState<'' | 'digital' | 'print'>('')
  const [viewing, setViewing] = useState<{ n: number; data: Doc } | null>(null)
  const [verKey, setVerKey] = useState(0)
  const [linked, setLinked] = useState<string | null>(null)
  const [photoBox, setPhotoBox] = useState(false)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoReplace, setPhotoReplace] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoResult, setPhotoResult] = useState<Placement[] | null>(null)
  // frase selezionata nella pagina: barra «Commenta / Chiedi una modifica» e riquadro del commento
  const [textSel, setTextSel] = useState<(TextSel & { top: number; left: number }) | null>(null)
  const [quoteBox, setQuoteBox] = useState<(TextSel & { top: number; left: number }) | null>(null)
  const [aiQuoteSel, setAiQuote] = useState<{ bid: string; quote: string } | null>(null)
  const [aiPrefill, setAiPrefill] = useState<string | null>(null)

  // anteprima
  const preview = useRef<LivePreviewHandle>(null)
  const [renderedJson, setRenderedJson] = useState('')
  const [busy, setBusy] = useState(false)
  const [fitting, setFitting] = useState(false)
  const [warnings, setWarnings] = useState<Warn[]>([])
  const [pvInfo, setPvInfo] = useState('Preparo l\'anteprima…')
  const inFlight = useRef(false)
  const pending = useRef<Doc | null>(null)

  const canEdit = !viewing
  const draftJson = useMemo(() => (draft ? JSON.stringify(draft) : ''), [draft])
  const dirty = !!draft && draftJson !== saved.current

  /* ------------------------------------------------------------ caricamento */
  const loadDoc = useCallback(async () => {
    const d = await api.get<DocFull>(`/documents/${id}`)
    setInfo(d)
    setHead(d.head)
    saved.current = JSON.stringify(d.data)
    let restored: Doc | null = null
    try {
      const raw = localStorage.getItem(`imp-draft-${id}`)
      if (raw) {
        const b = JSON.parse(raw) as { base: number; data: Doc }
        if (b.base === d.head && JSON.stringify(b.data) !== saved.current &&
          confirm('Hai modifiche non salvate di una sessione precedente su questo documento. Vuoi recuperarle?')) restored = b.data
        else localStorage.removeItem(`imp-draft-${id}`)
      }
    } catch { /* niente */ }
    setDraft(restored ?? d.data)
    hist.current = { past: [], future: [], key: '', at: 0 }
    return d
  }, [id])
  const loadComments = useCallback(() => api.get<Comment[]>(`/documents/${id}/comments`).then(setComments).catch(() => {}), [id])
  useEffect(() => {
    loadDoc().catch(e => { toast(e.message, true); go('/') })
    loadComments()
    api.get<User[]>('/users').then(setUsers)
    linkedName(id).then(setLinked)
  }, [id])

  useEffect(() => {
    if (!draft) return
    try {
      if (dirty) localStorage.setItem(`imp-draft-${id}`, JSON.stringify({ base: head, data: draft }))
      else localStorage.removeItem(`imp-draft-${id}`)
    } catch { /* spazio pieno */ }
  }, [draftJson, head])
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  /* ------------------------------------------------------------ modifiche con annulla/ripeti */
  const update = useCallback((fn: (d: Doc) => void, coalesce?: string) => {
    setDraft(prev => {
      if (!prev) return prev
      const next = clone(prev)
      fn(next)
      const h = hist.current
      const now = Date.now()
      if (!(coalesce && h.key === coalesce && now - h.at < 2000)) {
        h.past.push(prev)
        if (h.past.length > 80) h.past.shift()
      }
      h.key = coalesce ?? ''
      h.at = now
      h.future = []
      return next
    })
  }, [])
  const undo = () => { const h = hist.current; const p = h.past.pop(); if (!p || !draft) return; h.future.push(draft); h.key = ''; setDraft(p); force(x => x + 1) }
  const redo = () => { const h = hist.current; const f = h.future.pop(); if (!f || !draft) return; h.past.push(draft); h.key = ''; setDraft(f); force(x => x + 1) }

  /* ------------------------------------------------------------ impaginazione nel browser */
  const render = useCallback(async (data: Doc, label?: string) => {
    if (inFlight.current) { pending.current = data; return }
    inFlight.current = true
    setBusy(true)
    try {
      const r = await preview.current!.render(data)
      setWarnings(r.warnings)
      setPvInfo(`${label ?? 'Anteprima aggiornata'} · ${r.pages} pagine`)
      if (!label) setRenderedJson(JSON.stringify(data))
    } catch (e) {
      setPvInfo(`Errore: ${(e as Error).message}`)
    } finally {
      inFlight.current = false
      setBusy(false)
      const p = pending.current
      pending.current = null
      if (p) render(p)
    }
  }, [])

  const autoFit = async () => {
    if (!draft) return
    setFitting(true); setBusy(true)
    const work = clone(draft)
    const changes: Record<string, number> = {}
    try {
      for (let i = 0; i < 3; i++) {
        const r = await preview.current!.render(work)
        const fix = r.warnings.filter(w => w.tight < 3)
        setWarnings(r.warnings)
        setPvInfo(`Anteprima aggiornata · ${r.pages} pagine`)
        if (!fix.length) break
        for (const w of fix) for (const ch of work.chapters) for (const s of ch.sections) if (s.id === w.section) { s.layout.tight = w.tight + 1; changes[s.id] = w.tight + 1 }
      }
      const r = await preview.current!.render(work)
      setWarnings(r.warnings)
      setPvInfo(`Anteprima aggiornata · ${r.pages} pagine`)
      if (Object.keys(changes).length) {
        update(d => { for (const ch of d.chapters) for (const s of ch.sections) if (changes[s.id] !== undefined) s.layout.tight = changes[s.id]! })
        setRenderedJson(JSON.stringify(work))
        toast(`Compattate ${Object.keys(changes).length} sezioni. Ricordati di salvare.`)
      } else toast('Nessuna sezione da compattare oltre: accorcia il testo o cambia le colonne.')
    } finally { setFitting(false); setBusy(false) }
  }

  // testo cambiato nell'ispettore: si scrive subito nella pagina visibile, la reimpaginazione arriva dopo senza salti
  const prevDraft = useRef<Doc | null>(null)
  useEffect(() => {
    const prev = prevDraft.current
    prevDraft.current = draft
    if (!draft || !prev || viewing || sel?.kind !== 'block') return
    const a = locate(draft, sel.id)?.block, b = locate(prev, sel.id)?.block
    if (a && b && 'html' in a && 'html' in b && a.html !== b.html && a.type === b.type) preview.current?.patch(a.id, inline(a.html))
  }, [draftJson])

  useEffect(() => {
    if (!draft || viewing || draftJson === renderedJson) return
    const t = window.setTimeout(() => render(draft), renderedJson ? AUTO_PREVIEW_MS : 50)
    return () => window.clearTimeout(t)
  }, [draftJson, viewing])

  /* ------------------------------------------------------------ salvataggio (+ file collegato) */
  const writeFile = async (quiet = false) => {
    try {
      if (await writeLinked(id, me.name, team())) { if (!quiet) toast(`Salvato anche nel file ${linked}`); return true }
    } catch (e) { toast(`Non riesco a scrivere il file collegato: ${(e as Error).message}`, true) }
    return false
  }
  const save = async (forceSave = false) => {
    if (!draft) return
    setSaving(true)
    try {
      const r = await api.post<{ number: number; data: Doc }>(`/documents/${id}/versions`, { data: draft, message, base: forceSave ? null : head })
      saved.current = JSON.stringify(r.data)
      setHead(r.number)
      setMessage(''); setSavePop(false)
      setVerKey(k => k + 1)
      try { localStorage.removeItem(`imp-draft-${id}`) } catch { /* */ }
      const wrote = linked ? await writeFile(true) : false
      toast(wrote ? `Salvata la versione ${r.number}, anche nel file ${linked}` : `Salvata la versione ${r.number} in questo browser. Per il team: File → Scarica il file .oe`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (confirm(`Nel frattempo è stata salvata la versione ${e.body.head} (da un'altra scheda o da un file aperto). Salvare comunque la tua bozza come nuova versione?`)) { setSaving(false); return save(true) }
      } else toast((e as Error).message, true)
    } finally { setSaving(false) }
  }

  const restore = async (n: number) => {
    try {
      const r = await api.post<{ number: number }>(`/documents/${id}/versions/${n}/restore`)
      setViewing(null)
      await loadDoc()
      try { localStorage.removeItem(`imp-draft-${id}`) } catch { /* */ }
      setVerKey(k => k + 1)
      if (linked) await writeFile(true)
      toast(`Ripristinata: ora è la versione ${r.number}`)
    } catch (e) { toast((e as Error).message, true) }
  }

  const view = async (n: number | null) => {
    if (n === null) { setViewing(null); if (draft) render(draft); return }
    const v = await api.get<{ data: Doc }>(`/documents/${id}/versions/${n}`)
    setViewing({ n, data: v.data })
    setSel(null)
    render(v.data, `Versione ${n}`)
  }

  /* ------------------------------------------------------------ PDF (stampa del browser) */
  const printPdf = async (mode: 'digital' | 'print') => {
    const doc = viewing?.data ?? draft
    if (!doc) return
    setPrintHelp('')
    setPrinting(mode)
    try { await preview.current!.print(doc, mode) } catch (e) { toast((e as Error).message, true) } finally { setPrinting('') }
  }

  /* ------------------------------------------------------------ foto aggiunte dopo: analisi e sistemazione */
  const placeNow = async () => {
    if (!draft || !photoFiles.length) return
    setPhotoBusy(true)
    try {
      const fd = new FormData()
      fd.append('data', JSON.stringify(draft))
      fd.append('onlyEmpty', photoReplace ? '0' : '1')
      for (const f of photoFiles) fd.append('photos', f)
      const r = await api.form<{ data: Doc; placements: Placement[] }>(`/documents/${id}/place`, fd)
      update(d => { Object.assign(d, r.data) })
      setPhotoResult(r.placements)
      setPhotoFiles([])
    } catch (e) { toast((e as Error).message, true) } finally { setPhotoBusy(false) }
  }

  /* ------------------------------------------------------------ file .oe */
  const exportFile = async () => {
    if (dirty) toast('Il file contiene le versioni salvate: le modifiche in bozza non sono incluse.')
    download(await buildFile(id, me.name, team()), fileName(info?.title || 'documento'))
  }
  const doLink = async () => {
    try {
      const n = await linkFile(id, info?.title || 'documento')
      setLinked(n)
      await writeFile(true)
      toast(`Collegato a ${n}: ogni «Salva versione» aggiorna il file`)
    } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message, true) }
  }

  /* ------------------------------------------------------------ tastiera */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) setSavePop(true) }
      const t = e.target as HTMLElement
      const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
      if (mod && e.key.toLowerCase() === 'z' && !typing && canEdit) { e.preventDefault(); e.shiftKey ? redo() : undo() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  /* ------------------------------------------------------------ commenti sulla pagina */
  const shownDoc = viewing?.data ?? draft
  const { pins, counts } = useMemo(() => {
    const pins: Pin[] = []
    const counts: Record<string, number> = {}
    if (!shownDoc) return { pins, counts }
    const byBlock: Record<string, Comment[]> = {}
    for (const c of comments) if (!c.parent_id && !c.resolved && c.block_id) (byBlock[c.block_id] ??= []).push(c)
    for (const [bid, cs] of Object.entries(byBlock)) {
      pins.push({ blockId: bid, count: cs.length, threadId: cs[cs.length - 1]!.id })
      const w = locate(shownDoc, bid)
      if (w?.sec) counts[w.sec.id] = (counts[w.sec.id] ?? 0) + cs.length
    }
    return { pins, counts }
  }, [comments, shownDoc])

  const marks = useMemo<Mark[]>(() => comments.filter(c => !c.parent_id && !c.resolved && c.block_id && c.quote).map(c => ({ threadId: c.id, blockId: c.block_id!, quote: c.quote! })), [comments])
  // i commenti su una frase sono evidenziati nel testo: niente segnaposto numerato per loro
  const blockPins = useMemo(() => pins.map(p => {
    const n = comments.filter(c => !c.parent_id && !c.resolved && c.block_id === p.blockId && !c.quote).length
    return n ? { ...p, count: n } : null
  }).filter((x): x is Pin => !!x), [pins, comments])

  const selId = sel && 'id' in sel ? sel.id : sel?.kind === 'cover' ? (shownDoc?.cover.id ?? 'cover') : null
  const shownRef = useRef(shownDoc)
  shownRef.current = shownDoc
  // il clic arriva dall'iframe dell'anteprima: si legge il documento mostrato dal ref (sempre aggiornato)
  const pick = useCallback((bid: string) => {
    const doc = shownRef.current
    if (!doc) return
    setSel(selFromId(doc, bid))
    setTab(t => { if (t === 'commenti') setAnchor(bid); return t === 'versioni' && !viewingRef.current ? 'modifica' : t })
  }, [])
  const viewingRef = useRef(viewing)
  viewingRef.current = viewing
  const commentOn = (bid: string) => { setAnchor(bid); setTab('commenti') }

  /* ------------------------------------------------------------ AI: bersaglio = punto selezionato */
  const aiQuote = aiQuoteSel && aiQuoteSel.bid === selId ? aiQuoteSel.quote : undefined
  const aiFocus = useMemo(() => {
    const d = shownDoc
    if (!d || !sel) return { id: null, label: 'documento intero' }
    if (sel.kind === 'cover') return { id: 'cover', label: 'copertina', quote: aiQuote }
    const w = locate(d, sel.id)
    if (!w) return { id: null, label: 'documento intero' }
    if (w.block) return { id: sel.id, label: `${blockLabel(w.block)} «${blockExcerpt(w.block, 50)}» (sezione «${w.sec?.title || w.ch.title}»)`, quote: aiQuote }
    if (w.sec) return { id: sel.id, label: `sezione «${w.sec.title || w.ch.title}»`, quote: aiQuote }
    return { id: sel.id, label: `capitolo «${w.ch.title}»`, quote: aiQuote }
  }, [sel, shownDoc, aiQuote])
  const applyAi = (d: Doc, touched: string[]) => {
    update(x => { Object.assign(x, d) })
    const first = touched[0]
    if (first) { const s = selFromId(d, first); if (s) setSel(s) }
  }
  const askAiOnSel = (s: TextSel) => {
    const doc = shownRef.current
    if (doc) setSel(selFromId(doc, s.bid))
    setAiQuote({ bid: s.bid, quote: s.quote })
    setTextSel(null)
    setTab('ai'); setAiPrefill(s.quote)
  }

  if (!info || !draft) return <><TopBar eyebrow="Layout Designer" title="Carico…" /><div className="progress"><i /></div></>

  const status = viewing ? null : dirty
    ? <span className="oe-badge oe-badge--warning">Modifiche non salvate</span>
    : <span className="oe-badge oe-badge--success">Salvato · v{head}</span>
  const openCount = comments.filter(c => !c.parent_id && !c.resolved).length

  return (
    <>
      <TopBar eyebrow={<a href="#/">Documenti</a>} title={draft.meta.title || info.title}>
        <span className="app-status">{status}{printing && <span>Preparo il PDF…</span>}</span>
        {canEdit && <>
          <button className="iconbtn" onClick={undo} disabled={!hist.current.past.length} aria-label="Annulla (⌘Z)" title="Annulla (⌘Z)"><Icon name="undo" /></button>
          <button className="iconbtn" onClick={redo} disabled={!hist.current.future.length} aria-label="Ripeti (⇧⌘Z)" title="Ripeti (⇧⌘Z)"><Icon name="redo" /></button>
        </>}
        <Menu button={(_, t) => <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={t} disabled={!!printing}><Icon name="download" />PDF</button>}>
          {close => (
            <>
              <div className="menu__head">{viewing ? `Versione ${viewing.n}` : 'Quello che vedi nell\'anteprima'}</div>
              <button className="menu__item" onClick={() => { close(); setPrintHelp('digital') }}>PDF digitale<small>per web ed email</small></button>
              <button className="menu__item" onClick={() => { close(); setPrintHelp('print') }}>PDF per la tipografia<small>con abbondanze 3 mm (colori RGB)</small></button>
            </>
          )}
        </Menu>
        <Menu button={(_, t) => <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={t}><Icon name="share" />File</button>}>
          {close => (
            <>
              <div className="menu__head">{linked ? `Collegato a ${linked}` : 'Per condividere con il team'}</div>
              <button className="menu__item" onClick={() => { close(); exportFile() }}>Scarica il file .oe<small>da mettere nella cartella condivisa</small></button>
              {canLink() && !linked && <button className="menu__item" onClick={() => { close(); doLink() }}>Collega a un file nella cartella condivisa<small>ogni «Salva versione» lo aggiorna da solo</small></button>}
              {linked && <button className="menu__item" onClick={() => { close(); writeFile() }}>Aggiorna adesso {linked}</button>}
              {linked && <button className="menu__item" onClick={() => { close(); unlink(id).then(() => setLinked(null)) }}>Scollega il file</button>}
            </>
          )}
        </Menu>
        {canEdit && (
          <div className="menu">
            <button className="oe-btn oe-btn--primary oe-btn--sm" disabled={!dirty || saving} onClick={() => setSavePop(v => !v)}>{saving ? 'Salvo…' : 'Salva versione'}</button>
            {savePop && (
              <div className="menu__panel" style={{ width: 340, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label className="oe-field"><span className="oe-label">Cosa hai cambiato? (facoltativo)</span>
                  <input className="oe-input" autoFocus value={message} onChange={e => setMessage(e.target.value)} placeholder="Es.: corretti i numeri del capitolo 5"
                    onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setSavePop(false) }} /></label>
                <div className="insp__actions" style={{ justifyContent: 'flex-end' }}>
                  <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => setSavePop(false)}>Annulla</button>
                  <button className="oe-btn oe-btn--primary oe-btn--sm" disabled={saving} onClick={() => save()}>Salva versione {head + 1} <Icon name="arrow" /></button>
                </div>
              </div>
            )}
          </div>
        )}
      </TopBar>
      {viewing && (
        <div className="banner">
          <b>Stai guardando la versione {viewing.n}</b> (sola lettura).
          <button className="oe-btn oe-btn--inverse oe-btn--sm" onClick={() => view(null)}>Torna alla bozza</button>
          <button className="oe-btn oe-btn--inverse oe-btn--sm" onClick={() => { if (confirm(`Ripristinare la versione ${viewing.n}?`)) restore(viewing.n) }}>Ripristina questa versione</button>
        </div>
      )}
      <div className="ed">
        <aside className="ed__outline">
          {canEdit && <div style={{ padding: '0 var(--oe-space-m) var(--oe-space-xs)' }}>
            <button className="oe-btn oe-btn--secondary oe-btn--sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setPhotoResult(null); setPhotoBox(true) }}><Icon name="image" />Aggiungi foto</button>
          </div>}
          <Outline doc={shownDoc!} sel={sel} setSel={s => { setSel(s); if (tab === 'versioni') setTab('modifica') }} counts={counts} canEdit={canEdit} update={update} />
        </aside>
        <section className="ed__preview ed__preview--live" aria-label="Anteprima delle pagine">
          <LivePreview ref={preview} selId={selId} onPick={pick} pins={viewing ? [] : blockPins} marks={viewing ? [] : marks} onPin={t => { setActiveThread(t); setTab('commenti') }}
            onTextSel={s => { setTextSel(s); if (s) setQuoteBox(null) }} brochure={draft.meta.kind === 'brochure'}
            busy={busy} info={pvInfo} stale={!viewing && draftJson !== renderedJson} warnings={viewing ? [] : warnings}
            onFit={autoFit} fitting={fitting} onGoSection={sid => setSel({ kind: 'section', id: sid })} onRefresh={() => draft && render(draft)}
            overlay={<>
              {textSel && !quoteBox && (
                <div className="selbar" style={{ top: Math.max(4, textSel.top - 44), left: textSel.left }} role="toolbar" aria-label="Frase selezionata">
                  <button className="oe-btn oe-btn--primary oe-btn--sm" onMouseDown={e => e.preventDefault()} onClick={() => { setQuoteBox(textSel); setTextSel(null) }}><Icon name="comment" />Commenta</button>
                  {canEdit && <button className="oe-btn oe-btn--secondary oe-btn--sm" onMouseDown={e => e.preventDefault()} onClick={() => askAiOnSel(textSel)}>Chiedi una modifica</button>}
                </div>
              )}
              {quoteBox && (
                <div className="quotebox" style={{ top: quoteBox.top + quoteBox.h + 8, left: Math.max(12, quoteBox.left - 180) }} role="dialog" aria-label="Commento sulla frase">
                  <div className="cm__quote">«{quoteBox.quote.length > 140 ? quoteBox.quote.slice(0, 139) + '…' : quoteBox.quote}»</div>
                  <Composer docId={id} users={users} anchor={quoteBox.bid} quote={quoteBox.quote} autoFocus placeholder="Scrivi il commento. Con @ citi un collega." onCancel={() => setQuoteBox(null)}
                    onSent={() => { setQuoteBox(null); loadComments(); if (linked) writeFile(true) }} />
                </div>
              )}
            </>} />
        </section>
        <aside className="ed__side">
          <div className="oe-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'modifica'} className={`oe-tab${tab === 'modifica' ? ' is-active' : ''}`} onClick={() => setTab('modifica')}>Modifica</button>
            <button role="tab" aria-selected={tab === 'ai'} className={`oe-tab${tab === 'ai' ? ' is-active' : ''}`} onClick={() => setTab('ai')}>Chiedi all'AI</button>
            <button role="tab" aria-selected={tab === 'commenti'} className={`oe-tab${tab === 'commenti' ? ' is-active' : ''}`} onClick={() => { setTab('commenti'); if (selId) setAnchor(sel?.kind === 'cover' ? 'cover' : selId) }}>Commenti{openCount ? ` (${openCount})` : ''}</button>
            <button role="tab" aria-selected={tab === 'versioni'} className={`oe-tab${tab === 'versioni' ? ' is-active' : ''}`} onClick={() => setTab('versioni')}>Versioni</button>
          </div>
          <div className="ed__panel" role="tabpanel">
            {tab === 'modifica' && <Inspector doc={shownDoc!} sel={sel} setSel={setSel} update={update} canEdit={canEdit} docId={id}
              onComment={commentOn} focusNew={focusNew} setFocusNew={setFocusNew} />}
            {tab === 'ai' && <AiPanel doc={shownDoc!} focus={aiFocus} canEdit={canEdit} onApply={applyAi} prefill={aiPrefill} clearPrefill={() => setAiPrefill(null)} />}
            {tab === 'commenti' && <Comments docId={id} doc={shownDoc!} comments={comments} users={users} anchor={anchor} setAnchor={setAnchor}
              active={activeThread} setActive={setActiveThread} reload={() => { loadComments(); if (linked) writeFile(true) }} onGoTo={bid => { const s = selFromId(shownDoc!, bid); if (s) setSel(s) }} />}
            {tab === 'versioni' && <Versions docId={id} head={head} viewing={viewing?.n ?? null} onView={view} onRestore={restore}
              onDownload={async n => { await view(n); setPrintHelp('digital') }} canEdit dirty={dirty} refreshKey={verKey} />}
          </div>
        </aside>
      </div>
      {photoBox && (
        <Modal title={photoResult ? 'Dove ho messo le foto' : 'Aggiungi foto'} onClose={() => setPhotoBox(false)}
          foot={photoResult
            ? <button className="oe-btn oe-btn--primary oe-btn--md" onClick={() => setPhotoBox(false)}>Fatto</button>
            : <><button className="oe-btn oe-btn--ghost oe-btn--md" onClick={() => setPhotoBox(false)}>Annulla</button>
              <button className="oe-btn oe-btn--primary oe-btn--md" disabled={!photoFiles.length || photoBusy} onClick={placeNow}>{photoBusy ? 'Guardo le foto…' : 'Sistema le foto'} <Icon name="arrow" /></button></>}>
          {photoResult ? (
            <>
              <PhotoReport items={photoResult} />
              <p className="hint">Le foto sono nella bozza: se il risultato non ti convince premi Annulla (⌘Z), altrimenti «Salva versione».</p>
            </>
          ) : (
            <>
              <PhotoDrop files={photoFiles} setFiles={setPhotoFiles} />
              <label className="oe-check"><input type="checkbox" checked={photoReplace} onChange={e => setPhotoReplace(e.target.checked)} /> Sostituisci anche le foto già messe (altrimenti riempio solo i posti vuoti)</label>
            </>
          )}
        </Modal>
      )}
      {printHelp && (
        <Modal title={printHelp === 'print' ? 'PDF per la tipografia' : 'PDF digitale'} onClose={() => setPrintHelp('')}
          foot={<><button className="oe-btn oe-btn--ghost oe-btn--md" onClick={() => setPrintHelp('')}>Annulla</button>
            <button className="oe-btn oe-btn--primary oe-btn--md" onClick={() => printPdf(printHelp)}>Apri la stampa <Icon name="arrow" /></button></>}>
          <p>Si apre la finestra di stampa del browser con le immagini in alta risoluzione. Lì:</p>
          <ol className="hint" style={{ fontSize: 15, lineHeight: 1.6, paddingLeft: 20, margin: 0 }}>
            <li>come destinazione scegli <b>Salva come PDF</b>;</li>
            <li>in «Altre impostazioni» lascia attiva <b>Grafica di sfondo</b> (senza, foto e fondi viola spariscono);</li>
            <li>margini: <b>Predefiniti</b> o <b>Nessuno</b>; la misura della pagina è già impostata.</li>
          </ol>
          {printHelp === 'print' && <p className="hint">Il PDF ha le abbondanze di 3 mm ma i colori restano RGB: se la tipografia chiede il CMYK lo converte lei, oppure si converte con la versione del tool che gira sul server. Usa Chrome o Edge.</p>}
          {printHelp === 'digital' && <p className="hint">Usa Chrome o Edge: sono i browser con cui il risultato è identico all'anteprima.</p>}
        </Modal>
      )}
    </>
  )
}
