import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './shared/index.css'
import App from './app/App.tsx'
import { AuthProvider } from './features/auth/AuthProvider.tsx'
import { I18nProvider } from './shared/i18n/i18n.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
