import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'
import type { Me } from './types'
import { ToastProvider } from './ui/ui'
import Login from './pages/Login'
import Documents from './pages/Documents'
import People from './pages/People'
import Editor from './editor/Editor'

/* Navigazione con l'hash (#/doc/<id>): funziona dietro qualsiasi server senza configurazioni. */
export function useRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const h = () => setHash(location.hash)
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}
export const go = (to: string) => { location.hash = to }

interface Session { me: Me; refresh: () => void; logout: () => void }
const SessionCtx = createContext<Session>(null as unknown as Session)
export const useSession = () => useContext(SessionCtx)

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const route = useRoute()
  const refresh = useCallback(() => { api.get<Me>('/me').then(setMe).catch(() => setMe(null)) }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const h = () => setMe(null)
    window.addEventListener('imp:logout', h)
    return () => window.removeEventListener('imp:logout', h)
  }, [])
  const logout = useCallback(() => { api.post('/auth/logout').finally(() => { setMe(null); go('/') }) }, [])

  let page = null
  if (me === undefined) page = null
  else if (me === null) page = <Login onDone={refresh} />
  else {
    const m = route.path.match(/^\/doc\/([0-9a-f]+)$/)
    if (m) page = <Editor key={m[1]} id={m[1]} focusComment={route.params.get('commento')} />
    else if (route.path === '/persone') page = <People />
    else page = <Documents />
  }
  return (
    <ToastProvider>
      <div className="app">
        {me ? <SessionCtx.Provider value={{ me, refresh, logout }}>{page}</SessionCtx.Provider> : page}
      </div>
    </ToastProvider>
  )
}
