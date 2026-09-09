import { lazy, Suspense, useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TechnicianLayout } from './layouts/TechnicianLayout'
import { SupervisorLayout } from './layouts/SupervisorLayout'
import { TechnicalSupervisorLayout } from './layouts/TechnicalSupervisorLayout'
import './App.css'
import { getSessionRole, roleHome } from './features/auth/authApi'

const LoginPage = lazy(async () => ({
  default: (await import('./features/auth/LoginPage')).LoginPage,
}))
const ChecklistListPage = lazy(() => import('./pages/ChecklistListPage'))
const ChecklistExecutionPage = lazy(() => import('./pages/ChecklistExecutionPage'))
const ChecklistVisitDetailPage = lazy(() => import('./pages/ChecklistVisitDetailPage'))
const RoutesPage = lazy(() => import('./pages/RoutesPage'))
const TicketDetailPage = lazy(() => import('./pages/TicketDetailPage'))
const SupervisorNewTicketPage = lazy(() => import('./pages/SupervisorNewTicketPage'))
const SupervisorTicketsPage = lazy(() => import('./pages/SupervisorTicketsPage'))
const SupervisorTicketDetailPage = lazy(() => import('./pages/SupervisorTicketDetailPage'))
const TechnicalSupervisorVisitsPage = lazy(() => import('./pages/TechnicalSupervisorVisitsPage'))
const TechnicalSupervisorCompletedPage = lazy(() => import('./pages/TechnicalSupervisorCompletedPage'))
const TechnicalSupervisorIncidentDetailPage = lazy(() => import('./pages/TechnicalSupervisorIncidentDetailPage'))
const TechnicalSupervisorChecklistsPage = lazy(() => import('./pages/TechnicalSupervisorChecklistsPage'))
const TechnicalSupervisorChecklistDetailPage = lazy(() => import('./pages/TechnicalSupervisorChecklistDetailPage'))

function Loading() {
  return <main className="session-placeholder">Cargando…</main>
}

function RoleRoute({ allowed, children }: { allowed: string[]; children: ReactNode }) {
  const role = getSessionRole()
  const normalized = (role ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const matches = role === null || allowed.includes(normalized)
  return matches ? children : <Navigate to={roleHome(role)} replace />
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    Boolean(sessionStorage.getItem('nf_access_token'))
  )

  const [homePath, setHomePath] = useState(() => roleHome(getSessionRole()))
  const handleAuthenticated = useCallback((nextPath?: string) => {
    setHomePath(nextPath ?? roleHome(getSessionRole()))
    setIsAuthenticated(true)
  }, [])

  const handleLogout = useCallback(() => {
    sessionStorage.clear()
    setHomePath('/checklists')
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
                <Navigate to={homePath} replace />
              ) : (
                <LoginPage onAuthenticated={handleAuthenticated} />
              )
            }
          />
          <Route
            element={
              isAuthenticated ? (
                <RoleRoute allowed={['tecnico']}><TechnicianLayout onLogout={handleLogout} /></RoleRoute>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            <Route path="/checklists" element={<ChecklistListPage />} />
            <Route path="/checklists/:id" element={<ChecklistVisitDetailPage />} />
            <Route path="/checklists/:id/start" element={<ChecklistExecutionPage />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/routes/:id" element={<TicketDetailPage />} />
          </Route>
          <Route element={isAuthenticated ? <RoleRoute allowed={['supervisor de cuenta', 'supervisor tecnico']}><TechnicalSupervisorLayout onLogout={handleLogout} /></RoleRoute> : <Navigate to="/login" replace />}>
            <Route path="/technical-supervisor/visits" element={<TechnicalSupervisorVisitsPage />} />
            <Route path="/technical-supervisor/incidents/:id" element={<TechnicalSupervisorIncidentDetailPage />} />
            <Route path="/technical-supervisor/incidents/completed" element={<TechnicalSupervisorCompletedPage />} />
            <Route path="/technical-supervisor/checklists" element={<TechnicalSupervisorChecklistsPage />} />
            <Route path="/technical-supervisor/checklists/:id" element={<TechnicalSupervisorChecklistDetailPage />} />
          </Route>
          <Route
            element={
              isAuthenticated ? <RoleRoute allowed={['supervisor de tienda']}><SupervisorLayout onLogout={handleLogout} /></RoleRoute> : <Navigate to="/login" replace />
            }
          >
            <Route path="/supervisor/tickets/new" element={<SupervisorNewTicketPage />} />
            <Route path="/supervisor/tickets" element={<SupervisorTicketsPage />} />
            <Route path="/supervisor/tickets/:id" element={<SupervisorTicketDetailPage />} />
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
