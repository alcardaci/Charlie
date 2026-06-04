import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { hydrateLocalStateCache } from './utils/localStateStorage.ts'
import { initializeThemeMode } from './utils/theme.ts'

async function bootstrap() {
  try {
    initializeThemeMode()
  } catch (error) {
    console.warn('[bootstrap] unable to initialize theme mode', error)
  }

  try {
    await hydrateLocalStateCache()
  } catch (error) {
    console.warn('[bootstrap] unable to hydrate local state cache', error)
  }

  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Root element not found')
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void bootstrap()
