import { lazy, Suspense, useEffect } from 'react'
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  Link,
} from 'react-router-dom'
import type { UserRole } from './types/models'
import { useAuth } from './features/auth/AuthProvider'
import { canAccess, roleHomes } from './features/auth/session'
import PortalLayout from './layouts/PortalLayout'
import { LoadingState } from './components/ui'
import { ErrorBoundary } from './components/feedback/ErrorBoundary'
const Login = lazy(async () => ({ default: (await import('./features/auth/LoginPage')).LoginPage }))
const Password = lazy(() => import('./features/auth/PasswordPage'))
const ChecklistList = lazy(() => import('./pages/ChecklistListPage'))
const ChecklistDetail = lazy(() => import('./pages/ChecklistVisitDetailPage'))
const ChecklistExecution = lazy(() => import('./pages/ChecklistExecutionPage'))
const Routes = lazy(() => import('./pages/RoutesPage'))
const Ticket = lazy(() => import('./pages/TicketDetailPage'))
const NewTicket = lazy(() => import('./pages/SupervisorNewTicketPage'))
const Tickets = lazy(() => import('./pages/SupervisorTicketsPage'))
const TicketDetail = lazy(() => import('./pages/SupervisorTicketDetailPage'))
const Scheduling = lazy(() => import('./pages/TechnicalSupervisorVisitsPage'))
const Incident = lazy(() => import('./pages/TechnicalSupervisorIncidentDetailPage'))
const Completed = lazy(() => import('./pages/TechnicalSupervisorCompletedPage'))
const ReviewList = lazy(() => import('./pages/TechnicalSupervisorChecklistsPage'))
const Review = lazy(() => import('./pages/TechnicalSupervisorChecklistDetailPage'))
const Admin = lazy(() => import('./features/administration/AdministrationPage'))
function Root() {
  const location = useLocation()
  useEffect(() => {
    const updateTitle = () => {
      document.title = `${document.querySelector('h1')?.textContent ?? 'Portal'} | National Facilities`
    }
    updateTitle()
    const observer = new MutationObserver(updateTitle)
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true })
    window.scrollTo(0, 0)
    return () => observer.disconnect()
  }, [location.pathname])
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingState />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  )
}
export function RoleGuard({ allowed }: { allowed: UserRole[] }) {
  const { session, status } = useAuth()
  if (status === 'initializing') return <LoadingState />
  if (!session)
    return <Navigate to={status === 'expired' ? '/session-expired' : '/login'} replace />
  if (!canAccess(session, allowed)) return <Navigate to="/403" replace />
  return <Outlet />
}
function Home() {
  const { session, status } = useAuth()
  return status === 'initializing' ? (
    <LoadingState />
  ) : (
    <Navigate to={session ? roleHomes[session.user.role] : '/login'} replace />
  )
}
function ErrorPage({ code }: { code: '403' | '404' | 'expired' }) {
  return (
    <main className="session-placeholder">
      <section className="session-placeholder__card">
        <h1>
          {code === '403'
            ? 'Acceso denegado'
            : code === '404'
              ? 'Recurso no encontrado'
              : 'Sesión expirada'}
        </h1>
        <p>
          {code === 'expired'
            ? 'Vuelve a iniciar sesión para continuar.'
            : 'Revisa la dirección o vuelve al portal de tu rol.'}
        </p>
        <Link className="nf-link" to={code === 'expired' ? '/login' : '/'}>
          Volver al inicio
        </Link>
      </section>
    </main>
  )
}
const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/login', element: <Login /> },
      { path: '/session-expired', element: <ErrorPage code="expired" /> },
      { path: '/403', element: <ErrorPage code="403" /> },
      {
        element: (
          <RoleGuard
            allowed={['technician', 'store_supervisor', 'account_supervisor', 'administrator']}
          />
        ),
        children: [
          {
            element: <PortalLayout />,
            children: [
              { path: '/profile/password', element: <Password /> },
              {
                element: <RoleGuard allowed={['technician']} />,
                children: [
                  { path: '/checklists', element: <ChecklistList /> },
                  { path: '/checklists/:id', element: <ChecklistDetail /> },
                  { path: '/checklists/:id/start', element: <ChecklistExecution /> },
                  { path: '/routes', element: <Routes /> },
                  { path: '/routes/:id', element: <Ticket /> },
                ],
              },
              {
                element: <RoleGuard allowed={['store_supervisor']} />,
                children: [
                  { path: '/supervisor/tickets/new', element: <NewTicket /> },
                  { path: '/supervisor/tickets', element: <Tickets /> },
                  { path: '/supervisor/tickets/:id', element: <TicketDetail /> },
                ],
              },
              {
                element: <RoleGuard allowed={['account_supervisor']} />,
                children: [
                  { path: '/technical-supervisor/visits', element: <Scheduling /> },
                  { path: '/technical-supervisor/incidents/:id', element: <Incident /> },
                  { path: '/technical-supervisor/incidents/completed', element: <Completed /> },
                  { path: '/technical-supervisor/checklists', element: <ReviewList /> },
                  { path: '/technical-supervisor/checklists/:id', element: <Review /> },
                ],
              },
              {
                element: <RoleGuard allowed={['administrator']} />,
                children: [{ path: '/admin/:kind', element: <Admin /> }],
              },
            ],
          },
        ],
      },
      { path: '*', element: <ErrorPage code="404" /> },
    ],
  },
])
export default function App() {
  return <RouterProvider router={router} />
}
