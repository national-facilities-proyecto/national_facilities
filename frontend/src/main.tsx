import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { readConfig } from './app/config'
import { RepositoriesContext } from './app/RepositoriesProvider'
import { AuthProvider } from './features/auth/AuthProvider'
import { ErrorBoundary } from './components/feedback/ErrorBoundary'
import { LoadingState } from './components/ui'
const root = createRoot(document.getElementById('root')!)
root.render(<LoadingState />)
async function bootstrap() {
  try {
    const config = readConfig(import.meta.env)
    const repositories =
      import.meta.env.VITE_DATA_SOURCE === 'mock'
        ? (await import('./mocks/repositories')).createMockRepositories()
        : (await import('./services/adapters/httpRepositories')).createHttpRepositories(
            config.apiUrl,
          )
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <RepositoriesContext.Provider value={repositories}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </RepositoriesContext.Provider>
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (error) {
    root.render(
      <main className="session-placeholder">
        <section role="alert">
          <h1>Configuración incompleta</h1>
          <p>{error instanceof Error ? error.message : 'No se pudo iniciar el portal.'}</p>
        </section>
      </main>,
    )
  }
}
void bootstrap()
