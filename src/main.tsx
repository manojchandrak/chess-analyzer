import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './components/AuthProvider.tsx'
import { SyncBridge } from './components/SyncBridge.tsx'

// Makes the site installable and usable offline after a first visit (production builds only, so development isn't cached).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SyncBridge />
      <App />
    </AuthProvider>
  </StrictMode>,
)
