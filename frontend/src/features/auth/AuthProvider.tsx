import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '../../types/models'
import type { LoginInput } from '../../services/repositories/contracts'
import { useRepositories } from '../../app/RepositoriesProvider'
import { clearNfSession } from './session'
type AuthState = {
  session: Session | null
  status: 'initializing' | 'anonymous' | 'authenticated' | 'expired'
  login(input: LoginInput): Promise<Session>
  logout(this: void): Promise<void>
  changePassword(password: string): Promise<void>
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
      setSession(null)
      setStatus('expired')
    }
    const logout = () => {
      setSession(null)
      setStatus('anonymous')
    }
    window.addEventListener('nf:expired', expire)
    window.addEventListener('nf:logout', logout)
    const timer = session
      ? setTimeout(expire, Math.max(0, session.expiresAt - Date.now()))
      : undefined
    return () => {
      clearTimeout(timer)
      window.removeEventListener('nf:expired', expire)
      window.removeEventListener('nf:logout', logout)
    }
  }, [session])
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
    async changePassword(password) {
      const next = await auth.changePassword(password)
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
