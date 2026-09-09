import { type FormEvent, useId, useState } from 'react'
import { AuthenticationError, login, roleHome, saveSession } from './authApi'
import logo from '../../assets/national-facilities-logo.png'

type LoginPageProps = {
  onAuthenticated: (homePath?: string) => void
}

type LoginErrors = {
  email?: string
  password?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateLogin(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {}
  const normalizedEmail = email.trim()

  if (!normalizedEmail) {
    errors.email = 'Ingresa tu correo electrónico.'
  } else if (!emailPattern.test(normalizedEmail)) {
    errors.email = 'Ingresa un correo electrónico válido.'
  }

  if (!password) {
    errors.password = 'Ingresa tu contraseña.'
  }

  if (password && password.length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.'
  return errors
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const emailId = useId()
  const passwordId = useId()
  const [mode, setMode] = useState<'login' | 'recovery'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [requestError, setRequestError] = useState('')
  const [recoverySent, setRecoverySent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordChangeError, setPasswordChangeError] = useState('')

  const resetMessages = () => {
    setErrors({})
    setRequestError('')
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetMessages()

    const validationErrors = validateLogin(email, password)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setIsSubmitting(true)
    try {
      const tokens = await login(email, password)
      saveSession(tokens)
      if (localStorage.getItem('nf_password_initialized') !== 'true') setMustChangePassword(true)
      else onAuthenticated(roleHome(tokens.role ?? null))
    } catch (error) {
      setRequestError(
        error instanceof AuthenticationError
          ? error.message
          : 'Ocurrió un error inesperado. Inténtalo nuevamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRecovery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetMessages()
    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setErrors({ email: 'Ingresa tu correo electrónico.' })
      return
    }

    if (!emailPattern.test(normalizedEmail)) {
      setErrors({ email: 'Ingresa un correo electrónico válido.' })
      return
    }

    // Flujo temporal de interfaz. El backend todavía no ofrece recuperación.
    setRecoverySent(true)
  }

  const showLogin = () => {
    setMode('login')
    setRecoverySent(false)
    resetMessages()
  }

  const handleFirstPasswordChange = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (newPassword.length < 8) { setPasswordChangeError('La contraseña debe tener al menos 8 caracteres.'); return }; if (newPassword !== confirmPassword) { setPasswordChangeError('Las contraseñas no coinciden.'); return }; localStorage.setItem('nf_password_initialized', 'true'); onAuthenticated() }
  if (mustChangePassword) return <main className="auth-page"><section className="auth-card" aria-labelledby="password-change-title"><div className="brand" aria-label="National Facilities"><img className="brand__logo" src={logo} alt="National Facilities" /></div><h1 id="password-change-title">Crea tu nueva contraseña</h1><p className="auth-card__intro">Por seguridad, reemplaza la contraseña asignada para continuar.</p>{passwordChangeError && <div className="auth-alert" role="alert">{passwordChangeError}</div>}<form className="auth-form" onSubmit={handleFirstPasswordChange}><div className="field"><label className="field__label" htmlFor="new-password">Nueva contraseña</label><input id="new-password" className="field__input" type="password" value={newPassword} minLength={8} required onChange={(event) => setNewPassword(event.target.value)} /></div><div className="field"><label className="field__label" htmlFor="confirm-password">Confirmar contraseña</label><input id="confirm-password" className="field__input" type="password" value={confirmPassword} minLength={8} required onChange={(event) => setConfirmPassword(event.target.value)} /></div><button className="button button--primary" type="submit">Guardar contraseña</button></form></section></main>
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand" aria-label="National Facilities">
          <img className="brand__logo" src={logo} alt="National Facilities" />
          <span>
            <strong>National Facilities</strong>
            <small>Sistema de Gestión de Mantenimiento</small>
          </span>
        </div>

        {mode === 'login' ? (
          <>
            <h1 id="auth-title">Iniciar sesión</h1>

            {requestError && (
              <div className="auth-alert" role="alert">
                <span>{requestError}</span>
              </div>
            )}

            <form className="auth-form" noValidate onSubmit={handleLogin}>
              <div className="field">
                <label className="field__label" htmlFor={emailId}>Usuario</label>
                <input
                  className="field__input"
                  id={emailId}
                  name="email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="Ingresa tu usuario"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? `${emailId}-error` : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (errors.email || requestError) resetMessages()
                  }}
                />
                {errors.email && <p className="field__error" id={`${emailId}-error`}>{errors.email}</p>}
              </div>

              <div className="field">
                <label className="field__label" htmlFor={passwordId}>Contraseña</label>
                <div className="field__control">
                  <input
                    className="field__input field__input--password"
                    id={passwordId}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    autoComplete="current-password"
                    aria-invalid={Boolean(errors.password)}
                    placeholder="Ingresa tu contraseña"
                    aria-describedby={errors.password ? `${passwordId}-hint ${passwordId}-error` : `${passwordId}-hint`}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      if (errors.password || requestError) resetMessages()
                    }}
                  />
                  <button
                    className="field__toggle"
                    type="button"
                    aria-controls={passwordId}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <p className="field__hint" id={`${passwordId}-hint`}>Mínimo 8 caracteres.</p>
                {errors.password && (
                  <p className="field__error" id={`${passwordId}-error`}>{errors.password}</p>
                )}
              </div>

              <button className="button button--primary" type="submit" disabled={isSubmitting}>
                {isSubmitting && <span className="button__spinner" aria-hidden="true" />}
                {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 id="auth-title">Recuperar contraseña</h1>
            <p className="auth-card__intro">
              Ingresa tu correo y te enviaremos instrucciones para crear una nueva contraseña.
            </p>

            {recoverySent ? (
              <div className="auth-alert auth-alert--success" role="status">
                <span>Si el correo está registrado, recibirás las instrucciones de recuperación.</span>
              </div>
            ) : (
              <form className="auth-form" noValidate onSubmit={handleRecovery}>
                <div className="field">
                  <label className="field__label" htmlFor={emailId}>Usuario</label>
                  <input
                    className="field__input"
                    id={emailId}
                    name="recovery-email"
                    type="email"
                    value={email}
                    autoComplete="email"
                    inputMode="email"
                    placeholder="Ingresa tu usuario"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? `${emailId}-error` : undefined}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (errors.email) setErrors({})
                    }}
                  />
                  {errors.email && <p className="field__error" id={`${emailId}-error`}>{errors.email}</p>}
                </div>
                <button className="button button--primary" type="submit">Enviar instrucciones</button>
              </form>
            )}

            <button className="text-button auth-card__back" type="button" onClick={showLogin}>
              Volver al inicio de sesión
            </button>
          </>
        )}
      </section>
    </main>
  )
}
