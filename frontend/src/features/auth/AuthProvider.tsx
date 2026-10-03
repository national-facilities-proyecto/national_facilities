import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '../../types/models'
import type { LoginInput } from '../../services/repositories/contracts'
import { useRepositories } from '../../app/RepositoriesProvider'
import { clearNfSession } from './session'
import { savedSession } from '../../services/http/client'
type AuthState = {
  session: Session | null
  status: 'initializing' | 'anonymous' | 'authenticated' | 'expired'
  login(input: LoginInput): Promise<Session>
  logout(this: void): Promise<void>
  changePassword(password: string, currentPassword?: string, confirmation?: string): Promise<void>
}
const AuthContext = createContext<AuthState | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = useRepositories()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthState['status']>('initializing')
  useEffect(() => {
    let active = true
    void auth.restore().then(
      (value) => {
        if (active) {
          setSession(value)
          setStatus(value ? 'authenticated' : 'anonymous')
        }
      },
      () => {
        if (active) {
          clearNfSession()
          setStatus('expired')
        }
      },
    )
    return () => {
      active = false
    }
  }, [auth])
  useEffect(() => {
    const expire = () => {
      clearNfSession()
      setStatus('expired')
    }
    const logout = () => {
      setSession(null)
      setStatus('anonymous')
    }
    const renewed = () => {
      const next = savedSession()
      if (next) setSession(next)
    }
    window.addEventListener('nf:expired', expire)
    window.addEventListener('nf:logout', logout)
    window.addEventListener('nf:session', renewed)
    const timer = session
      ? setTimeout(
          () => {
            if (auth.refresh)
              void auth
                .refresh()
                .then((next) => {
                  if (next) setSession(next)
                })
                .catch(() => undefined)
            else expire()
          },
          Math.max(1000, session.expiresAt - Date.now() - 30000),
        )
      : undefined
    return () => {
      clearTimeout(timer)
      window.removeEventListener('nf:expired', expire)
      window.removeEventListener('nf:logout', logout)
      window.removeEventListener('nf:session', renewed)
    }
  }, [session, auth])
  const value: AuthState = {
    session,
    status,
    async login(input) {
      const next = await auth.login(input)
      setSession(next)
      setStatus('authenticated')
      return next
    },
    async logout() {
      await auth.logout()
      setSession(null)
      setStatus('anonymous')
    },
    async changePassword(password, currentPassword, confirmation) {
      const next = await auth.changePassword(password, currentPassword, confirmation)
      setSession(next)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('Falta el proveedor de sesión.')
  return value
}
