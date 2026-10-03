import { LoaderCircle } from 'lucide-react'
import { Alert, Button } from '../ui'
import { errorMessage } from '../../services/errors'

export function QueryFeedback({
  query,
}: {
  query: { refreshing: boolean; refreshError?: unknown; reload(this: void): void }
}) {
  if (query.refreshError)
    return (
      <Alert>
        No se pudo actualizar la información. Se muestran los últimos datos recibidos del servidor.{' '}
        {errorMessage(query.refreshError)}{' '}
        <Button variant="secondary" onClick={query.reload}>
          Reintentar actualización
        </Button>
      </Alert>
    )
  if (!query.refreshing) return null
  return (
    <div className="nf-query-refresh" role="status">
      <LoaderCircle size={16} aria-hidden="true" />
      <span>Actualizando información…</span>
    </div>
  )
}
