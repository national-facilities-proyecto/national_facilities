import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useRepositories } from '../../app/RepositoriesProvider'
import { Alert, Button, Card, Input, PageHeader } from '../../components/ui'
import { errorMessage } from '../../services/errors'
export default function PasswordPage() {
  const auth = useAuth()
  const { source } = useRepositories()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <PageHeader title="Cambiar contraseña" />
      <Card>
        {source === 'mock' && (
          <Alert success>
            Simulación: se registra el cambio para tu usuario. No se almacena la contraseña ni se
            modifica una cuenta real.
          </Alert>
        )}
        <form
          className="nf-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            setError('')
            if (password.length < 8 || password !== confirmation) {
              setError('Usa al menos 8 caracteres y confirma la misma contraseña.')
              return
            }
            setBusy(true)
            void auth
              .changePassword(password)
              .then(() => {
                setMessage('Cambio registrado correctamente.')
                setPassword('')
                setConfirmation('')
              })
              .catch((cause) => setError(errorMessage(cause)))
              .finally(() => setBusy(false))
          }}
        >
          <Input
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            label="Confirmar contraseña"
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
