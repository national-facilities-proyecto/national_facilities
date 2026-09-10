import { useId, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { roleHomes } from './session'
import { Alert, Button, Input, LoadingState } from '../../components/ui'
import { errorMessage } from '../../services/errors'
import logo from '../../assets/national-facilities-logo.png'

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const passwordId = useId()
  if (auth.status === 'initializing') return <LoadingState />
  if (auth.session) return <Navigate to={roleHomes[auth.session.user.role]} replace />

  const submit = async () => {
    if (busy) return
    setError('')
    if (!username.trim() || !password) {
      setError('Ingresa tu usuario y contraseña.')
      return
    }
    setBusy(true)
    try {
      const session = await auth.login({
        kind: 'credentials',
        username: username.trim(),
        password,
      })
      void navigate(roleHomes[session.user.role], { replace: true })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand">
          <img
            className="brand__logo"
            src={logo}
            alt="National Facilities"
            width="250"
            height="60"
            fetchPriority="high"
          />
        </div>
        <h1>Iniciar sesión</h1>
        <p className="auth-card__intro">Gestión de mantenimiento y visitas técnicas</p>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Input
            label="Usuario"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <div className="auth-password-field">
            <label htmlFor={passwordId}>Contraseña</label>
            <input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="auth-password-toggle"
              type="button"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <Eye aria-hidden="true" size={20} /> : <EyeOff aria-hidden="true" size={20} />}
            </button>
          </div>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </Button>
        </form>
      </section>
    </main>
  )
}
