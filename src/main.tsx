import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// design system OpenEconomics: token, font e componenti (unica fonte, nessuna copia)
import '@ds/styles/colors_and_type.css'
import '@ds/components/components.css'
import './app.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
