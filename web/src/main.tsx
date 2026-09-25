import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CrashGuard } from './Crash'
import { AppProvider } from './ctx'
import { LangProvider } from './i18n'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LangProvider>
        <CrashGuard>
          <AppProvider>
            <App />
          </AppProvider>
        </CrashGuard>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>,
)
