import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui'
import { AppError, errorMessage } from '../../services/errors'
export default function PasswordPage() {
  const auth = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  return (
    <>
      <PageHeader title="Cambiar contraseña" />
      <Card>
        {!auth.session?.user.passwordInitialized && (
          <Alert>Debes cambiar la contraseña inicial antes de acceder a la operación.</Alert>
        )}
        <form
          className="nf-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            setError('')
            setFields({})
            setMessage('')
            if (password.length < 8 || password !== confirmation) {
              setError('Usa al menos 8 caracteres y confirma la misma contraseña.')
              return
            }
            setBusy(true)
            void auth
              .changePassword(password, currentPassword, confirmation)
              .then(() => {
                setMessage('Cambio registrado correctamente.')
                setPassword('')
                setConfirmation('')
                setCurrentPassword('')
              })
              .catch((cause) => {
                setError(errorMessage(cause))
                setFields(cause instanceof AppError ? cause.fields : {})
              })
              .finally(() => setBusy(false))
          }}
        >
          {auth.session?.user.passwordInitialized && (
            <Input
              label="Contraseña actual"
              errors={fields.currentPassword}
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          )}
          <Input
            label="Nueva contraseña"
            errors={fields.password}
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            label="Confirmar contraseña"
            errors={fields.confirmation}
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {error && <Alert>{error}</Alert>}
          {message && (
            <Alert success>
              {message} <Link to="/">Volver al inicio</Link>
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      </Card>
    </>
  )
}
