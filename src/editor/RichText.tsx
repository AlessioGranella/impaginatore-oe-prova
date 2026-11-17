import { useEffect, useRef } from 'react'

/** Testo modificabile con il solo grassetto (il DS non usa il corsivo nei report).
 *  Invio divide il blocco in due (nuovo paragrafo); Maiusc+Invio va a capo nello stesso blocco. */
export default function RichText({ value, onChange, onSplit, short, label, autoFocus }: {
  value: string; onChange: (html: string) => void; onSplit?: (before: string, after: string) => void
  short?: boolean; label: string; autoFocus?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value
  }, [value])
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus()
      const r = document.createRange()
      r.selectNodeContents(ref.current)
      r.collapse(false)
      const s = getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
    }
  }, [autoFocus])

  const emit = () => ref.current && onChange(ref.current.innerHTML)
  const bold = () => { document.execCommand('bold'); emit() }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); bold(); return }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); return } // niente corsivo
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey || !onSplit) { document.execCommand('insertLineBreak'); emit(); return }
      const el = ref.current!
      const sel = getSelection()
      if (!sel || !sel.rangeCount) return
      const r = sel.getRangeAt(0).cloneRange()
      r.setEndAfter(el.lastChild ?? el)
      const frag = r.extractContents()
      const tmp = document.createElement('div')
      tmp.appendChild(frag)
      onSplit(el.innerHTML, tmp.innerHTML)
    }
  }
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const t = e.clipboardData.getData('text/plain').replace(/\r/g, '')
    document.execCommand('insertText', false, t)
    emit()
  }
  return (
    <div className="rte">
      <div className="rte__bar">
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={bold} title="Grassetto (⌘B)" aria-label="Grassetto"><b>G</b></button>
      </div>
      <div ref={ref} className={`rte__area${short ? ' rte__area--short' : ''}`} contentEditable suppressContentEditableWarning
        role="textbox" aria-multiline="true" aria-label={label} onInput={emit} onKeyDown={onKeyDown} onPaste={onPaste} />
    </div>
  )
}
