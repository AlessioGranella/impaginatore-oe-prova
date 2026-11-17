import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Design system OE: in locale è la cartella vicina (../../design-system); su GitHub Actions il workflow
// scarica il repo pubblico del DS e passa DS_PATH. Nessuna copia dei token.
const DS = resolve(process.env.DS_PATH || resolve(__dirname, '../../design-system'), 'src')

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@ds': DS }, dedupe: ['react', 'react-dom'] },
  server: { port: 5181, fs: { allow: [resolve(__dirname), DS] } },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), viewer: resolve(__dirname, 'viewer.html') } },
  },
})
