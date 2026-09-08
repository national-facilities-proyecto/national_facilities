type AuthTokens = { access: string; refresh: string }

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const normalizedUser = email.trim()
  if (!normalizedUser || !password) {
    throw new AuthenticationError('Completa tus credenciales para continuar.')
  }

  const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '')

  try {
    const response = await fetch(`${apiBaseUrl}/auth/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: normalizedUser,
        password,
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new AuthenticationError('Credenciales incorrectas. Verifica tu correo y contraseña.')
      }
      const data = (await response.json().catch(() => null)) as { detail?: string; message?: string } | null
      const detail = data?.detail ?? data?.message ?? 'No se pudo iniciar sesión. Verifica tus credenciales.'
      throw new AuthenticationError(detail)
    }

    const tokens = (await response.json()) as AuthTokens
    return tokens
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error
    }
    throw new AuthenticationError('No se pudo conectar con el servidor de autenticación.')
  }
}

export function saveSession(tokens: AuthTokens) {
  sessionStorage.setItem('nf_access_token', tokens.access)
  sessionStorage.setItem('nf_refresh_token', tokens.refresh)
  sessionStorage.setItem('nf_data_source', 'api')
}
