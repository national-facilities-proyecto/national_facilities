import { Alert, Button } from '../ui'
import { errorMessage } from '../../services/errors'

export function QueryFeedback({
  query,
}: {
  query: { refreshError?: unknown; reload(this: void): void }
}) {
  if (!query.refreshError) return null

  return (
    <Alert>
      No se pudo actualizar la información. Se muestran los últimos datos recibidos del servidor.{' '}
      {errorMessage(query.refreshError)}{' '}
      <Button variant="secondary" onClick={query.reload}>
        Reintentar actualización
      </Button>
    </Alert>
  )
}
