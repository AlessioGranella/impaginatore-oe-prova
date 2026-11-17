import { useRef, useState } from 'react'
import { assetUrl } from '../api'
import type { Placement } from '../local/place'

/** Resoconto: dove è andata ogni foto e perché. */
export function PhotoReport({ items }: { items: Placement[] }) {
  if (!items.length) return null
  const used = items.filter(i => i.where).length
  return (
    <div className="oe-field">
      <span className="oe-label">Foto: {used} sistemate su {items.length}</span>
      <div className="phrep">
        {items.map((it, i) => (
          <div className="phrep__row" key={it.photo || i}>
            {it.photo ? <img src={assetUrl(it.photo)} alt="" /> : <span className="phrep__ph" />}
            <div className="phrep__txt">
              <b>{it.where ?? 'Non usata'}</b>
              <span>{it.name} · {it.kind === 'soggetto' ? 'foto con soggetto' : 'foto d\'ambiente'}</span>
              <span>{it.reason}</span>
              {it.warn && <span className="phrep__warn">{it.warn}</span>}
            </div>
          </div>
        ))}
      </div>
      <span className="hint">Per spostare una foto: clicca la pagina nell'anteprima e scegli «Cambia o ritaglia». Tutte le foto restano tra le immagini del documento.</span>
    </div>
  )
}

/** Riquadro per caricare più foto insieme (trascina o scegli). */
export function PhotoDrop({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const add = (list: FileList | null) => {
    if (!list) return
    const imgs = Array.from(list).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name))
    const names = new Set(files.map(f => f.name))
    setFiles([...files, ...imgs.filter(f => !names.has(f.name))])
  }
  return (
    <div className="oe-field">
      <span className="oe-label">Foto (facoltative)</span>
      <div className={`drop drop--small${over ? ' is-over' : ''}`} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click() }}
        onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}>
        <strong>{files.length ? `${files.length} foto pronte` : 'Trascina qui le foto, anche tutte insieme'}</strong>
        <span>Il tool guarda ogni foto e la mette al posto giusto: copertina, aperture dei capitoli o in fondo alle sezioni.</span>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { add(e.target.files); e.target.value = '' }} />
      </div>
      {files.length > 0 && (
        <div className="phlist">
          {files.map(f => (
            <span key={f.name} className="phlist__item">{f.name}
              <button type="button" aria-label={`Togli ${f.name}`} onClick={() => setFiles(files.filter(x => x !== f))}>×</button></span>
          ))}
        </div>
      )}
      <span className="hint">Vuoi decidere tu? Chiama il file come il capitolo o la sezione («ambiente.jpg», «copertina.jpg») oppure scrivi nel Word una riga «[Foto: nome-file.jpg]» nel punto esatto.</span>
    </div>
  )
}
