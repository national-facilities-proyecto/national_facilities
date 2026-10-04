import { Link } from 'react-router-dom'
import { AppError, errorMessage } from '../../services/errors'
import { Alert, Button, PageHeader } from '../ui'
import { PageLoadingState } from './PageLoadingState'
export function QueryState({
  query,
  showHeading = true,
}: {
  query: { status: string; error?: unknown; reload(this: void): void }
  showHeading?: boolean
}) {
  if (query.status === 'loading') return <PageLoadingState showHeading={showHeading} />
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
