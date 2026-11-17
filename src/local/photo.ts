/* Analisi delle foto nel browser (nessun servizio esterno): dove sta il soggetto e che tipo di foto è.
   - soggetto: un elemento nitido e staccato dallo sfondo (es. l'animale su fondo sfocato delle foto OE)
   - ambiente: nitidezza e colore distribuiti su tutta l'immagine (paesaggi, texture, scenari)
   Metodo: su una copia piccola dell'immagine si combinano nitidezza (gradiente) e distanza dal colore
   dello sfondo (bordi); il baricentro dà il punto di ritaglio; concentrazione dell'interesse e sfondo
   sfocato dicono se c'è un soggetto. */

export interface PhotoInfo {
  width: number; height: number; ratio: number
  cx: number; cy: number          // punto di interesse (0..1)
  concentration: number           // quota di «interesse» vicino al baricentro (0..1)
  bgBlur: number                  // quanto è sfocato lo sfondo (0..1)
  kind: 'soggetto' | 'ambiente'
}

const N = 96

export async function analyzePhoto(blob: Blob): Promise<PhotoInfo> {
  const bm = await createImageBitmap(blob)
  const W = bm.width, H = bm.height
  const s = N / Math.max(W, H)
  const w = Math.max(8, Math.round(W * s)), h = Math.max(8, Math.round(H * s))
  const c = new OffscreenCanvas(w, h)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(bm, 0, 0, w, h)
  bm.close()
  const px = g.getImageData(0, 0, w, h).data
  const n = w * h
  const L = new Float32Array(n)
  for (let i = 0; i < n; i++) L[i] = 0.2126 * px[i * 4]! + 0.7152 * px[i * 4 + 1]! + 0.0722 * px[i * 4 + 2]!

  // nitidezza: gradiente di Sobel sulla luminanza
  const G = new Float32Array(n)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    const gx = L[i - w + 1]! + 2 * L[i + 1]! + L[i + w + 1]! - L[i - w - 1]! - 2 * L[i - 1]! - L[i + w - 1]!
    const gy = L[i + w - 1]! + 2 * L[i + w]! + L[i + w + 1]! - L[i - w - 1]! - 2 * L[i - w]! - L[i - w + 1]!
    G[i] = Math.hypot(gx, gy)
  }
  // colore dello sfondo: mediana dei pixel sul bordo
  const b = Math.max(1, Math.round(Math.min(w, h) * 0.06))
  const br: number[] = [], bgc: number[] = [], bb: number[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= b && x < w - b && y >= b && y < h - b) continue
    const i = (y * w + x) * 4
    br.push(px[i]!); bgc.push(px[i + 1]!); bb.push(px[i + 2]!)
  }
  const med = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1] ?? 0 }
  const bg = [med(br), med(bgc), med(bb)]
  const D = new Float32Array(n)
  for (let i = 0; i < n; i++) D[i] = Math.hypot(px[i * 4]! - bg[0]!, px[i * 4 + 1]! - bg[1]!, px[i * 4 + 2]! - bg[2]!)

  const p95 = (a: Float32Array) => { const t = Array.from(a).sort((p, q) => p - q); return t[Math.floor(t.length * 0.95)] || 1 }
  const gN = p95(G), dN = p95(D)
  const S = new Float32Array(n)
  let tot = 0, sx = 0, sy = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const v = Math.min(G[i]! / gN, 1) * Math.min(D[i]! / dN, 1)
    S[i] = v
    tot += v; sx += v * (x + 0.5); sy += v * (y + 0.5)
  }
  let cx = tot ? sx / tot / w : 0.5, cy = tot ? sy / tot / h : 0.5
  // concentrazione: quota di interesse entro un raggio pari al 22% della diagonale dal baricentro
  const r2 = (0.22 * Math.hypot(w, h)) ** 2
  let near = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - cx * w, dy = y + 0.5 - cy * h
    if (dx * dx + dy * dy <= r2) near += S[y * w + x]!
  }
  const concentration = tot ? near / tot : 0
  // sfocatura dello sfondo: nitidezza media sul bordo rispetto a quella del 10% di pixel più nitidi
  let gb = 0, nb = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= b && x < w - b && y >= b && y < h - b) continue
    gb += G[y * w + x]!; nb++
  }
  const gTop = (() => { const t = Array.from(G).sort((p, q) => q - p); const k = Math.max(1, Math.floor(t.length * 0.1)); return t.slice(0, k).reduce((a, v) => a + v, 0) / k || 1 })()
  const bgBlur = 1 - Math.min(1, (gb / Math.max(nb, 1)) / gTop)
  // un baricentro troppo vicino al bordo taglierebbe male: lo si riporta un po' verso il centro
  cx = Math.min(Math.max(cx, 0.15), 0.85); cy = Math.min(Math.max(cy, 0.15), 0.85)
  return { width: W, height: H, ratio: W / H, cx: +cx.toFixed(3), cy: +cy.toFixed(3), concentration: +concentration.toFixed(3), bgBlur: +bgBlur.toFixed(3), kind: concentration + 2 * (bgBlur - 0.9) >= SOGLIA ? 'soggetto' : 'ambiente' }
}

/** Soglia tarata sull'archivio OE (14 animali = soggetto, 18 scenari = ambiente): 30 foto su 34 classificate bene.
    Punteggio = concentrazione + 2 × (sfocatura dello sfondo − 0,9). */
export const SOGLIA = 0.62
