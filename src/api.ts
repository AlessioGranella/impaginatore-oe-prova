import { HttpError, handle } from './local/backend'
import { assetUrl as localAssetUrl } from './local/images'

export class ApiError extends Error {
  status: number
  body: any
  constructor(status: number, message: string, body: any) {
    super(message)
    this.status = status
    this.body = body
  }
}

/* Versione senza server: le chiamate vanno all'archivio del browser (src/local/backend.ts). */
async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  try {
    return (await handle(method, url, body)) as T
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 401) window.dispatchEvent(new Event('imp:logout'))
      throw new ApiError(e.status, e.message, (e as HttpError & { body?: unknown }).body ?? null)
    }
    throw e
  }
}

export const api = {
  get: <T>(u: string) => req<T>('GET', u),
  post: <T>(u: string, b: unknown = {}) => req<T>('POST', u, b),
  patch: <T>(u: string, b: unknown) => req<T>('PATCH', u, b),
  del: <T>(u: string) => req<T>('DELETE', u),
  form: <T>(u: string, f: FormData) => req<T>('POST', u, f),
}

export const assetUrl = (id: string, _thumb = false) => localAssetUrl(id)

const DF = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtDate = (t: number) => DF.format(new Date(t * 1000))
export function ago(t: number): string {
  const s = Date.now() / 1000 - t
  if (s < 60) return 'adesso'
  if (s < 3600) return `${Math.floor(s / 60)} min fa`
  if (s < 86400) return `${Math.floor(s / 3600)} h fa`
  return fmtDate(t)
}

export const nid = () => Math.random().toString(16).slice(2, 12)

/** Nella versione senza server non ci sono lavori in coda (impaginazione e PDF avvengono nel browser). */
export async function waitJob<T>(_id: string): Promise<T> { throw new Error('Funzione disponibile solo nella versione con server') }
