export type AuthUser = { id: number; username: string; email: string; name: string; role: string | null }
export type AuthTokens = { access: string; refresh: string; role?: string | null; user?: AuthUser }

export class AuthenticationError extends Error { constructor(message: string) { super(message); this.name = 'AuthenticationError' } }

const MOCK_USERS: Record<string, { password: string; role: string; name: string }> = {
  'supervisor.mass@gmail.com': { password: 'MassSupervisor123', role: 'Supervisor de tienda', name: 'Roberto Sánchez' },
  'tecnico@gmail.com': { password: 'Tecnico12345', role: 'Tecnico', name: 'Carlos Mendoza' },
  'supervisor.national@gmail.com': { password: 'Supervisor12345', role: 'Supervisor de cuenta', name: 'Cesar Orejuela' },
  'admin@gmail.com': { password: 'Administrador123', role: 'Administrador', name: 'Administrador' },
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const normalizedUser = email.trim()
  if (!normalizedUser || !password) throw new AuthenticationError('Completa tus credenciales para continuar.')
  if ((import.meta.env.VITE_DATA_SOURCE ?? 'mock') === 'mock') {
    const mockUser = MOCK_USERS[normalizedUser.toLowerCase()]
    if (!mockUser || mockUser.password !== password) throw new AuthenticationError('Credenciales mock incorrectas. Verifica el usuario y la contraseña.')
    return { access: `mock-access-${normalizedUser}`, refresh: `mock-refresh-${normalizedUser}`, role: mockUser.role, user: { id: 1, username: normalizedUser, email: normalizedUser, name: mockUser.name, role: mockUser.role } }
  }
  const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '')
  try {
    const response = await fetch(`${apiBaseUrl}/auth/login/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: normalizedUser, password }) })
    if (!response.ok) { if (response.status === 401) throw new AuthenticationError('Credenciales incorrectas. Verifica tu correo y contraseña.'); const data = await response.json().catch(() => null) as { detail?: string; message?: string } | null; throw new AuthenticationError(data?.detail ?? data?.message ?? 'No se pudo iniciar sesión.') }
    return await response.json() as AuthTokens
  } catch (error) { if (error instanceof AuthenticationError) throw error; throw new AuthenticationError('No se pudo conectar con el servidor de autenticación.') }
}

export function saveSession(tokens: AuthTokens) { sessionStorage.setItem('nf_access_token', tokens.access); sessionStorage.setItem('nf_refresh_token', tokens.refresh); sessionStorage.setItem('nf_data_source', import.meta.env.VITE_DATA_SOURCE ?? 'mock'); if (tokens.role) sessionStorage.setItem('nf_role', tokens.role); if (tokens.user) sessionStorage.setItem('nf_user', JSON.stringify(tokens.user)) }
export function getSessionRole(): string | null { return sessionStorage.getItem('nf_role') }
export function roleHome(role: string | null): string { const normalized = (role ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); if (normalized.includes('supervisor tecnico') || normalized.includes('supervisor de cuenta')) return '/technical-supervisor/visits'; if (normalized.includes('supervisor de tienda') || normalized.includes('supervisor tienda')) return '/supervisor/tickets/new'; return '/checklists' }
