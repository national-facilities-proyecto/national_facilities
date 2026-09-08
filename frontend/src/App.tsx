import { lazy, Suspense, useCallback, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TechnicianLayout } from './layouts/TechnicianLayout'
import './App.css'

const LoginPage = lazy(async () => ({
  default: (await import('./features/auth/LoginPage')).LoginPage,
}))
const ChecklistListPage = lazy(() => import('./pages/ChecklistListPage'))
const ChecklistExecutionPage = lazy(() => import('./pages/ChecklistExecutionPage'))
const RoutesPage = lazy(() => import('./pages/RoutesPage'))
const TicketDetailPage = lazy(() => import('./pages/TicketDetailPage'))

function Loading() {
  return <main className="session-placeholder">Cargando…</main>
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(sessionStorage.getItem('nf_access_token'))
  )

  const handleAuthenticated = useCallback(() => {
    setIsAuthenticated(true)
  }, [])

  const handleLogout = useCallback(() => {
    sessionStorage.clear()
    setIsAuthenticated(false)
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/checklists" replace />
              ) : (
                <LoginPage onAuthenticated={handleAuthenticated} />
              )
            }
          />
          <Route
            element={
              isAuthenticated ? (
                <TechnicianLayout onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            <Route path="/checklists" element={<ChecklistListPage />} />
            <Route path="/checklists/:id" element={<ChecklistExecutionPage />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/routes/:id" element={<TicketDetailPage />} />
          </Route>
          <Route
            path="*"
            element={<Navigate to={isAuthenticated ? '/checklists' : '/login'} replace />}
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
