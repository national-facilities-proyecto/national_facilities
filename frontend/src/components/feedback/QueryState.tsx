import { Link } from 'react-router-dom'
import { AppError, errorMessage } from '../../services/errors'
import { Alert, Button, LoadingState, PageHeader } from '../ui'
export function QueryState({
  query,
}: {
  query: { status: string; error?: unknown; reload(this: void): void }
}) {
  if (query.status === 'loading') return <LoadingState />
  if (query.error instanceof AppError && query.error.code === 'not_found')
    return (
      <>
        <PageHeader title="404 · Recurso no encontrado" />
        <Alert>
          {query.error.message} <Link to="/">Volver al inicio</Link>
        </Alert>
      </>
    )
  return (
    <Alert>
      {errorMessage(query.error)}{' '}
      <Button variant="secondary" onClick={query.reload}>
        Reintentar
      </Button>
    </Alert>
  )
}
