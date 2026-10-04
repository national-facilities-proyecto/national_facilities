import { useState } from 'react'
import { useAuth } from './AuthProvider'
import { Modal } from '../../components/ui/Modal'
import { Alert, Button, Input } from '../../components/ui'
import { errorMessage } from '../../services/errors'

export function SessionRecovery() {
  const auth = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (auth.status !== 'expired' || !auth.session) return null
  const username = auth.session.user.username ?? auth.session.user.email
  return (
    <Modal open title="Recuperar sesión" busy={busy} onClose={() => undefined}>
      <p>
        El borrador confirmado permanece en el servidor. El plazo del formulario continúa
        transcurriendo.
      </p>
      <p>Usuario: {username}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          void auth
            .login({ kind: 'credentials', username, password })
            .then(() => setPassword(''))
            .catch((cause) => setError(errorMessage(cause)))
            .finally(() => setBusy(false))
        }}
      >
        <Input
          label="Contraseña para recuperar sesión"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" disabled={busy}>
          Autenticar y continuar
        </Button>
      </form>
    </Modal>
  )
}
