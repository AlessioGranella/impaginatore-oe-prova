import { useEffect, useMemo, useRef, useState } from 'react'
import { api, assetUrl, waitJob } from '../api'
import { loadLibrary as loadLib } from '../local/images'
import { useSession } from '../App'
import type { Asset, ImageRef } from '../types'
import { Icon, Modal, Segment, useToast } from '../ui/ui'

export const loadLibrary = () => loadLib()

/** Uso dell'immagine: decide il rapporto del ritaglio e lo stile delle immagini AI. */
export type ImgUse = 'copertina' | 'apertura' | 'banda' | 'figura'

/* ----------------------------------------------------------------- campo immagine nel pannello */
export function ImageField({ value, onChange, aspect, use, docId, canEdit, optional, label }: {
  value: ImageRef | null; onChange: (v: ImageRef | null) => void; aspect: number; use: ImgUse
  docId: string; canEdit: boolean; optional?: boolean; label: string
}) {
  const [open, setOpen] = useState(false)
  // il riquadro ha le proporzioni del ritaglio vero (altezza massima 220 px)
  const thumbH = Math.min(220, 340 / aspect)
  return (
    <div className="imgfield">
      <span className="oe-label">{label}</span>
      <div className="imgfield__thumb" style={{ height: thumbH, aspectRatio: String(aspect), maxWidth: '100%' }}>
        {value ? <CropPreview value={value} aspect={aspect} /> : <div className="imgfield__none">Nessuna immagine</div>}
      </div>
      {canEdit && (
        <div className="insp__actions">
          <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={() => setOpen(true)}><Icon name="image" />{value ? 'Cambia o ritaglia' : 'Scegli immagine'}</button>
          {value && optional && <button className="oe-btn oe-btn--ghost oe-btn--sm" onClick={() => onChange(null)}>Togli</button>}
        </div>
      )}
      {open && <PickerModal initial={value} aspect={aspect} use={use} docId={docId} onClose={() => setOpen(false)}
        onPick={v => { onChange(v); setOpen(false) }} />}
    </div>
  )
}

/** Mostra il ritaglio come lo farà il motore (punto di interesse + zoom). */
function CropPreview({ value, aspect }: { value: ImageRef; aspect: number }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const c = nat ? cropRect(nat.w, nat.h, aspect, value) : null
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <img src={assetUrl(value.asset, true)} alt="" onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={c ? {
          position: 'absolute', width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${-c.x / c.w * 100}%`, top: `${-c.y / c.h * 100}%`, objectFit: 'fill',
        } : { opacity: 0 }} />
    </div>
  )
}

/** Stesso calcolo del motore (engine.ImagePrep.crop), in frazioni dell'immagine. */
export function cropRect(W: number, H: number, ar: number, v: ImageRef) {
  let cw: number, ch: number
  if (W / H > ar) { cw = H * ar; ch = H } else { cw = W; ch = W / ar }
  const z = Math.min(Math.max(v.zoom || 1, 0.2), 1)
  cw *= z; ch *= z
  const x = Math.min(Math.max(v.cx * W - cw / 2, 0), W - cw)
  const y = Math.min(Math.max(v.cy * H - ch / 2, 0), H - ch)
  return { x: x / W, y: y / H, w: cw / W, h: ch / H }
}

/* ----------------------------------------------------------------- finestra di scelta */
function PickerModal({ initial, aspect, use, docId, onClose, onPick }: {
  initial: ImageRef | null; aspect: number; use: ImgUse; docId: string; onClose: () => void; onPick: (v: ImageRef) => void
}) {
  const { me } = useSession()
  const toast = useToast()
  const [tab, setTab] = useState<'archivio' | 'documento' | 'ai'>('documento')
  const [lib, setLib] = useState<Asset[]>([])
  const [mine, setMine] = useState<Asset[]>([])
  const [cat, setCat] = useState('tutte')
  const [cur, setCur] = useState<ImageRef | null>(initial)
  const [subject, setSubject] = useState('')
  const [gen, setGen] = useState<'idle' | 'busy'>('idle')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadMine = () => api.get<Asset[]>(`/documents/${docId}/assets`).then(a => setMine(a.filter(x => x.kind === 'foto')))
  useEffect(() => { loadLibrary().then(a => setLib(a.filter(x => x.kind === 'foto'))); loadMine() }, [])
  const cats = useMemo(() => ['tutte', ...Array.from(new Set(lib.map(a => a.category || 'altro')))], [lib])
  const shown = tab === 'archivio' ? lib.filter(a => cat === 'tutte' || (a.category || 'altro') === cat) : mine

  const choose = (a: Asset) => setCur({ asset: a.id, cx: 0.5, cy: 0.5, zoom: 1 })
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      let last: Asset | null = null
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append('file', f); fd.append('kind', 'foto')
        last = await api.form<Asset>(`/documents/${docId}/assets`, fd)
      }
      await loadMine()
      setTab('documento')
      if (last) choose(last)
    } catch (e) { toast((e as Error).message, true) } finally { setUploading(false) }
  }
  const generate = async () => {
    setGen('busy')
    try {
      const { job } = await api.post<{ job: string }>(`/documents/${docId}/assets/generate`, { subject, use, n: 2 })
      const made = await waitJob<Asset[]>(job)
      await loadMine()
      setTab('documento')
      if (made[0]) choose(made[0])
      toast(`${made.length} immagini generate: le trovi in «Del documento»`)
    } catch (e) { toast((e as Error).message, true) } finally { setGen('idle') }
  }

  return (
    <Modal wide title="Immagine" onClose={onClose}
      foot={<>
        <button className="oe-btn oe-btn--ghost oe-btn--md" onClick={onClose}>Annulla</button>
        <button className="oe-btn oe-btn--primary oe-btn--md" disabled={!cur} onClick={() => cur && onPick(cur)}>Usa questa immagine <Icon name="arrow" /></button>
      </>}>
      <div className="picker">
        <div className="picker__lib">
          <div className="oe-tabs" role="tablist">
            {lib.length > 0 && <button role="tab" aria-selected={tab === 'archivio'} className={`oe-tab${tab === 'archivio' ? ' is-active' : ''}`} onClick={() => setTab('archivio')}>Archivio OE</button>}
            <button role="tab" aria-selected={tab === 'documento'} className={`oe-tab${tab === 'documento' ? ' is-active' : ''}`} onClick={() => setTab('documento')}>Del documento ({mine.length})</button>
            <button role="tab" aria-selected={tab === 'ai'} className={`oe-tab${tab === 'ai' ? ' is-active' : ''}`} onClick={() => setTab('ai')}>Genera con l'AI</button>
          </div>
          {tab === 'archivio' && <Segment label="Categoria" value={cat} onChange={setCat} options={cats.map(c => ({ v: c, l: c }))} />}
          {tab === 'documento' && (
            <div className="insp__actions">
              <button className="oe-btn oe-btn--secondary oe-btn--sm" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="plus" />{uploading ? 'Carico…' : 'Carica foto dal computer'}</button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => upload(e.target.files)} />
              <span className="hint">JPG o PNG, almeno 2500 px sul lato lungo per la stampa.</span>
            </div>
          )}
          {tab === 'ai' ? (
            me.ai ? (
              <div className="gen">
                <span className="oe-label">Che cosa deve mostrare?</span>
                <textarea className="oe-textarea" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Es.: un airone in volo sopra una palude all'alba" />
                <p>Lo stile è già impostato sulla fotografia OE: soggetto dal mondo animale o natura, luce calda sul soggetto, sfondo freddo e sfocato nei toni del viola, niente testo né loghi. Usa «{use}», formato adatto a dove va l'immagine. Ne genero 2: scegli tu quale usare.</p>
                <p>Le linee guida OE preferiscono foto reali: usa l'AI quando l'archivio non ha il soggetto che ti serve.</p>
                <div><button className="oe-btn oe-btn--primary oe-btn--md" disabled={subject.trim().length < 3 || gen === 'busy'} onClick={generate}>{gen === 'busy' ? 'Genero… (fino a un minuto)' : 'Genera 2 proposte'} <Icon name="arrow" /></button></div>
                {gen === 'busy' && <div className="progress"><i /></div>}
              </div>
            ) : (
              <div className="gen"><p>Nella versione di prova la generazione AI non c'è: servirebbe la chiave del servizio scritta nella pagina, visibile a tutti. Arriva con la versione sul server di OE.</p></div>
            )
          ) : (
            <div className="picker__grid">
              {shown.map(a => (
                <button key={a.id} className={`tile${cur?.asset === a.id ? ' is-active' : ''}`} onClick={() => choose(a)} title={a.name}>
                  <img src={assetUrl(a.id, true)} alt="" loading="lazy" />
                  <span>{a.source === 'ai' ? <b className="tile__src">AI · </b> : null}{a.name}</span>
                </button>
              ))}
              {shown.length === 0 && <p className="hint">Nessuna immagine nel documento. Caricane una dal computer: resta salvata nel documento e nel suo file .oe.</p>}
            </div>
          )}
        </div>
        <aside className="picker__side">
          <span className="oe-label">Ritaglio</span>
          {cur ? <FocusEditor value={cur} aspect={aspect} onChange={setCur} /> : <p className="hint">Scegli un'immagine a sinistra.</p>}
        </aside>
      </div>
    </Modal>
  )
}

function FocusEditor({ value, aspect, onChange }: { value: ImageRef; aspect: number; onChange: (v: ImageRef) => void }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const c = nat ? cropRect(nat.w, nat.h, aspect, value) : null
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onChange({ ...value, cx: +((e.clientX - r.left) / r.width).toFixed(3), cy: +((e.clientY - r.top) / r.height).toFixed(3) })
  }
  const scale = 1 / (value.zoom || 1)
  return (
    <>
      <div className="focus" onClick={click}>
        <img src={assetUrl(value.asset, true)} alt="" onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {c && <div className="focus__crop" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }} />}
        <div className="focus__dot" style={{ left: `${value.cx * 100}%`, top: `${value.cy * 100}%` }} />
      </div>
      <p className="hint">Clicca sul soggetto: il riquadro lime è la parte che finisce in pagina.</p>
      <label className="oe-field">
        <span className="oe-label">Ingrandimento · {scale.toFixed(1).replace('.', ',')}×</span>
        <input className="range" type="range" min={1} max={3} step={0.05} value={scale}
          onChange={e => onChange({ ...value, zoom: +(1 / +e.target.value).toFixed(3) })} />
      </label>
      <span className="oe-label">Come apparirà</span>
      <div className="imgfield__thumb" style={{ aspectRatio: String(aspect) }}><CropPreview value={value} aspect={aspect} /></div>
    </>
  )
}

/* ----------------------------------------------------------------- icone e illustrazioni del DS */
export function AssetGridPicker({ kind, value, onPick, onClose, title }: {
  kind: 'icona' | 'illustrazione'; value: string | null; onPick: (id: string | null) => void; onClose: () => void; title: string
}) {
  const [items, setItems] = useState<Asset[]>([])
  const [q, setQ] = useState('')
  useEffect(() => { loadLibrary().then(a => setItems(a.filter(x => x.kind === kind))) }, [kind])
  const shown = items.filter(a => a.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal wide title={title} onClose={onClose}
      foot={<><button className="oe-btn oe-btn--ghost oe-btn--md" onClick={() => onPick(null)}>Nessuna</button><button className="oe-btn oe-btn--secondary oe-btn--md" onClick={onClose}>Chiudi</button></>}>
      <input className="oe-input" placeholder="Cerca per nome…" value={q} onChange={e => setQ(e.target.value)} aria-label="Cerca" />
      <div className={`picker__grid${kind === 'icona' ? ' picker__grid--icons' : ''}`}>
        {shown.map(a => (
          <button key={a.id} className={`tile${kind === 'icona' ? ' tile--icon' : ''}${value === a.id ? ' is-active' : ''}`} onClick={() => onPick(a.id)} title={a.name}>
            <img src={assetUrl(a.id, kind !== 'icona')} alt="" loading="lazy" />
            <span>{a.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
