import { useEffect, useRef, useState } from 'react'
import { ago, api } from '../api'
import { addTeam } from '../local/backend'
import { importFile } from '../local/file'
import { go, useSession } from '../App'
import type { Brand, DocRow, Fmt, Kind } from '../types'
import { BRANDS } from '../local/brand'
import TopBar from '../ui/TopBar'
import { PhotoDrop, PhotoReport } from '../editor/PhotoReport'
import type { Placement } from '../local/place'
import { Icon, Menu, Modal, Segment, useToast } from '../ui/ui'

export default function Documents() {
  const toast = useToast()
  const [docs, setDocs] = useState<DocRow[] | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [dup, setDup] = useState<DocRow | null>(null)
  const fileIn = useRef<HTMLInputElement>(null)
  const openFile = async (f?: File | null) => {
    if (!f) return
    try {
      const r = await importFile(f)
      addTeam(r.team)
      const msg = { nuovo: `Aperto «${r.title}»`, aggiornato: `«${r.title}» aggiornato con le versioni del file`, 'gia-aggiornato': `«${r.title}» era già aggiornato: aggiunti solo i commenti nuovi`, copia: `Il file e la tua copia hanno versioni diverse: l'ho aperto come documento a parte` }[r.outcome]
      toast(msg)
      load()
    } catch (e) { toast((e as Error).message, true) }
  }
  const load = () => api.get<DocRow[]>('/documents').then(setDocs).catch(e => toast(e.message, true))
  useEffect(() => { load() }, [])

  const remove = async (d: DocRow) => {
    if (!confirm(`Eliminare «${d.title}» con tutte le versioni e i commenti? L'operazione non si può annullare.`)) return
    await api.del(`/documents/${d.id}`).catch(e => toast(e.message, true))
    load()
  }

  return (
    <>
      <TopBar eyebrow="Layout Designer" title="Documenti" />
      <main className="page">
        <div className="page-head">
          <div className="page-head__text">
            <span className="oe-tag-chip oe-tag-chip--lime" style={{ alignSelf: 'flex-start' }}>OpenEconomics Layout Designer</span>
            <h1>I tuoi documenti</h1>
            <p>Scegli il tipo di documento e il brand, carica il Word e le foto: il tool impagina con il design system OpenEconomics. Poi lo correggi (anche scrivendo a parole cosa cambiare), salvi le versioni e lo condividi.</p>
            <p className="hint">Versione di prova senza server: i documenti restano in questo browser. Per lavorarci in più persone si usa il file .oe del documento, tenuto nella cartella condivisa del team (menu «File» dentro il documento).</p>
          </div>
          <div className="insp__actions">
            <button className="oe-btn oe-btn--secondary oe-btn--lg" onClick={() => fileIn.current?.click()}>Apri un file .oe</button>
            <button className="oe-btn oe-btn--primary oe-btn--lg" onClick={() => setShowNew(true)}>Nuovo documento <Icon name="arrow" /></button>
            <input ref={fileIn} type="file" accept=".oe,application/json" hidden onChange={e => { openFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        </div>

        {docs && docs.length === 0 && (
          <div className="empty">
            <h2>Nessun documento</h2>
            <p>Parti da un file Word con i titoli impostati con gli stili di Word (Titolo 1, Titolo 2…): diventano capitoli e sezioni. Se un collega ti ha passato un file .oe, aprilo con «Apri un file .oe».</p>
            <button className="oe-btn oe-btn--primary oe-btn--md" onClick={() => setShowNew(true)}>Carica il primo Word <Icon name="arrow" /></button>
          </div>
        )}
        {docs && docs.length > 0 && (
          <div className="oe-table__wrap">
            <table className="oe-table doclist">
              <thead><tr><th>Documento</th><th>Tipo</th><th>Ultima modifica</th><th>Versione</th><th>Commenti aperti</th><th><span className="sr-only">Azioni</span></th></tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td><a href={`#/doc/${d.id}`}>{d.title}</a><div className="muted">creato da {d.author}</div></td>
                    <td className="muted">{d.kind === 'brochure' ? 'Brochure' : `Bilancio · ${d.format === 'a4o' ? 'A4 orizzontale' : 'A4 verticale'}`}<div>{BRANDS[d.brand ?? 'oe'].label}</div></td>
                    <td className="muted">{ago(d.updated_at)}</td>
                    <td className="muted">v{d.head}</td>
                    <td>{d.open_comments > 0 ? <span className="oe-badge oe-badge--info">{d.open_comments}</span> : <span className="muted">—</span>}</td>
                    <td>
                      <div className="doclist__actions">
                        <button className="oe-btn oe-btn--secondary oe-btn--sm" onClick={() => go(`/doc/${d.id}`)}>Apri</button>
                        <Menu button={(_, t) => <button className="iconbtn" onClick={t} aria-label={`Altre azioni su ${d.title}`}>⋯</button>}>
                          {close => (
                            <>
                              <button className="menu__item" onClick={() => { close(); setDup(d) }}>Duplica<small>anche in un altro formato o brand</small></button>
                              <button className="menu__item btn-danger" onClick={() => { close(); remove(d) }}>Elimina da questo browser</button>
                            </>
                          )}
                        </Menu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {showNew && <NewDocument onClose={() => setShowNew(false)} />}
      {dup && <Duplicate doc={dup} onClose={() => { setDup(null); load() }} />}
    </>
  )
}

const LOGO = (b: Brand) => `${import.meta.env.BASE_URL}render/logos/${BRANDS[b].dir}logo-white.svg`
const KINDS: { v: Kind; l: string; d: string; f: string }[] = [
  { v: 'bilancio', l: 'Bilancio di sostenibilità', d: 'Report lungo: copertina, sommario e aperture dei capitoli con foto sono fissi; le pagine interne le impagina il tool alternando le modalità in base al contenuto.', f: 'A4 verticale o orizzontale' },
  { v: 'brochure', l: 'Brochure', d: 'Sul modello delle brochure OpenEconomics, Externalytics e Sonar: una pagina per ogni sezione, con pagine a card, numeri, prodotto, citazione.', f: 'Orizzontale 303 × 177 mm' },
]
const STEPS = ['Tipo di documento', 'Brand', 'Word e foto']

/** Wizard: 1. bilancio o brochure, 2. brand, 3. Word, foto e titolo. */
function NewDocument({ onClose }: { onClose: () => void }) {
  const { me } = useSession()
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<Kind | null>(null)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<Fmt>('a4v')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [done, setDone] = useState<{ id: string; report: Record<string, any>; placements: Placement[] } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const pick = (f?: File | null) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.docx')) { setErr('Serve un file Word .docx'); return }
    setErr('')
    setFile(f)
  }
  const submit = async () => {
    if (!file || !kind || !brand) return
    setBusy(true)
    setErr('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('title', title)
    fd.append('format', format)
    fd.append('kind', kind)
    fd.append('brand', brand)
    for (const p of photos) fd.append('photos', p)
    try {
      setDone(await api.form<{ id: string; report: Record<string, any>; placements: Placement[] }>('/documents', fd))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    const r = done.report
    const br = kind === 'brochure'
    return (
      <Modal title="Word importato" onClose={onClose} foot={<button className="oe-btn oe-btn--primary oe-btn--md" onClick={() => go(`/doc/${done.id}`)}>Apri l'impaginato <Icon name="arrow" /></button>}>
        <div className="report">
          <div><b>{r.capitoli}</b><span>{br ? 'aperture' : 'capitoli'}</span></div>
          <div><b>{r.sezioni}</b><span>{br ? 'pagine' : 'sezioni'}</span></div>
          <div><b>{r.paragrafi}</b><span>paragrafi</span></div>
          <div><b>{r.tabelle}</b><span>tabelle e box</span></div>
        </div>
        {r.immagini > 0 && <p>Ho trovato anche {r.immagini} immagini nel Word: sono già nel documento.</p>}
        {r.scartate?.length > 0 && <p className="hint">Righe di copertina non usate: {r.scartate.join(' · ')}</p>}
        <PhotoReport items={done.placements} />
        {!done.placements.length && <p className="hint">Nessuna foto caricata: copertina e aperture restano a tinta piena. Le foto si aggiungono anche dopo, dall'editor («Aggiungi foto»).</p>}
        <p className="hint">{br ? 'Per ogni pagina il tool ha scelto un tipo (testo, card, numeri, prodotto…) in base al contenuto: lo cambi cliccando la pagina.' : 'Controlla anche i box grafici: per ognuno il tool ha scelto una forma (numeri chiave, linea del tempo, tabella…) che puoi cambiare.'}</p>
      </Modal>
    )
  }

  const canNext = step === 0 ? !!kind : step === 1 ? !!brand : !!file
  const foot = (
    <>
      {step > 0 ? <button className="oe-btn oe-btn--ghost oe-btn--md" disabled={busy} onClick={() => setStep(s => s - 1)}>Indietro</button>
        : <button className="oe-btn oe-btn--ghost oe-btn--md" onClick={onClose}>Annulla</button>}
      {step < 2
        ? <button className="oe-btn oe-btn--primary oe-btn--md" disabled={!canNext} onClick={() => setStep(s => s + 1)}>Avanti <Icon name="arrow" /></button>
        : <button className="oe-btn oe-btn--primary oe-btn--md" disabled={!file || busy} onClick={submit}>{busy ? (photos.length ? 'Impagino e sistemo le foto…' : 'Impagino…') : 'Importa e impagina'} <Icon name="arrow" /></button>}
    </>
  )
  return (
    <Modal title="Nuovo documento" onClose={onClose} foot={foot}>
      <ol className="wiz__steps" aria-label="Passaggi">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="wiz__n">{i + 1}</span>{s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="wiz__q">
          <h3 className="wiz__h">Che documento devi fare?</h3>
          <div className="choices" role="radiogroup" aria-label="Tipo di documento">
            {KINDS.map(k => (
              <button key={k.v} role="radio" aria-checked={kind === k.v} className={`choice${kind === k.v ? ' is-on' : ''}`}
                onClick={() => setKind(k.v)} onDoubleClick={() => { setKind(k.v); setStep(1) }}>
                <span className={`choice__thumb choice__thumb--${k.v}`} aria-hidden="true"><i /><i /><i /></span>
                <b>{k.l}</b><span>{k.d}</span><small>{k.f}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="wiz__q">
          <h3 className="wiz__h">Con quale brand devi fare questo documento?</h3>
          <div className="choices choices--3" role="radiogroup" aria-label="Brand">
            {(Object.keys(BRANDS) as Brand[]).map(b => {
              const B = BRANDS[b]
              return (
                <button key={b} role="radio" aria-checked={brand === b} className={`choice${brand === b ? ' is-on' : ''}`}
                  onClick={() => setBrand(b)} onDoubleClick={() => { setBrand(b); setStep(2) }}>
                  <span className="choice__logo" style={{ background: B.vars['--b700'] }}><img src={LOGO(b)} alt={B.label} /></span>
                  <span className="choice__sw" aria-hidden="true">{B.swatch.map(c => <i key={c} style={{ background: c }} />)}</span>
                  <b>{B.label}</b><span>{B.note}</span>
                </button>
              )
            })}
          </div>
          <p className="hint">Il brand cambia logo e colori; impaginazione, caratteri e regole restano quelli del design system OpenEconomics.</p>
        </div>
      )}

      {step === 2 && (
        <>
          <p className="wiz__sum">{KINDS.find(k => k.v === kind)?.l} · {brand && BRANDS[brand].label}</p>
          <div className={`drop${over ? ' is-over' : ''}`} role="button" tabIndex={0}
            onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click() }}
            onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }}>
            <strong>{file ? file.name : 'Trascina qui il Word del testo'}</strong>
            <span>{file ? 'Clicca per sceglierne un altro' : 'oppure clicca per sceglierlo dal computer · solo .docx'}</span>
            <input ref={input} type="file" accept=".docx" hidden onChange={e => pick(e.target.files?.[0])} />
          </div>
          {err && <div className="form-error" role="alert">{err}</div>}
          <PhotoDrop files={photos} setFiles={setPhotos} />
          <label className="oe-field">
            <span className="oe-label">Titolo (facoltativo)</span>
            <input className="oe-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Se lo lasci vuoto uso il titolo del Word" />
          </label>
          {kind === 'bilancio' && (
            <div className="oe-field">
              <span className="oe-label">Formato</span>
              <Segment label="Formato" value={format} onChange={setFormat} options={Object.entries(me.formats).map(([v, l]) => ({ v: v as Fmt, l }))} />
            </div>
          )}
          <p className="hint">{kind === 'brochure'
            ? 'Come leggo il Word: lo stile «Titolo» è la copertina, il primo livello di titolo diventa una pagina di apertura con foto, il secondo una pagina. Se sotto il secondo livello c\'è subito un terzo livello, il secondo va nella chip e il terzo diventa il titolo grande (come «Il contesto» + «Troppe incognite, pochi strumenti»). Sottotitoli seguiti da testo diventano voci, card o griglie; le tabelle di numeri diventano la pagina dei numeri.'
            : 'Come leggo il Word: lo stile «Titolo» è la copertina, il primo livello di titolo diventa capitolo (con pagina di apertura e foto), il secondo diventa sezione. Le tabelle con una prima riga di una sola cella («Box grafico – …») diventano box grafici. Le righe che iniziano con «Citazione in evidenza:» diventano citazioni.'}</p>
          {busy && <div className="progress"><i /></div>}
        </>
      )}
    </Modal>
  )
}

function Duplicate({ doc, onClose }: { doc: DocRow; onClose: () => void }) {
  const { me } = useSession()
  const toast = useToast()
  const [title, setTitle] = useState(`${doc.title} (copia)`)
  const [format, setFormat] = useState<Fmt>(doc.format)
  const [brand, setBrand] = useState<Brand>(doc.brand ?? 'oe')
  const run = async () => {
    try {
      const r = await api.post<{ id: string }>(`/documents/${doc.id}/duplicate`, { title, format, brand })
      go(`/doc/${r.id}`)
    } catch (e) { toast((e as Error).message, true) }
  }
  return (
    <Modal title="Duplica documento" onClose={onClose}
      foot={<><button className="oe-btn oe-btn--ghost oe-btn--md" onClick={onClose}>Annulla</button><button className="oe-btn oe-btn--primary oe-btn--md" onClick={run}>Duplica <Icon name="arrow" /></button></>}>
      <label className="oe-field"><span className="oe-label">Titolo</span><input className="oe-input" value={title} onChange={e => setTitle(e.target.value)} /></label>
      {doc.kind !== 'brochure' && <div className="oe-field"><span className="oe-label">Formato</span>
        <Segment label="Formato" value={format} onChange={setFormat} options={Object.entries(me.formats).map(([v, l]) => ({ v: v as Fmt, l }))} /></div>}
      <div className="oe-field"><span className="oe-label">Brand</span>
        <Segment label="Brand" value={brand} onChange={setBrand} options={(Object.keys(BRANDS) as Brand[]).map(b => ({ v: b, l: BRANDS[b].label }))} /></div>
      <p className="hint">La copia parte dall'ultima versione salvata, con le stesse foto. Versioni e commenti restano sull'originale.</p>
    </Modal>
  )
}
