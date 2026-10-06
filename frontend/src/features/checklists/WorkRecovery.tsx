import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
import { Card } from '../../components/ui'
import type { Visit, VisitPhase } from '../../types/models'
import { displayDate } from '../../utils/dates'
const phaseLabels: Record<VisitPhase, string> = {
  available: 'Disponible',
  reserved: 'Pendiente de iniciar',
  scheduled: 'Programado',
  physical_work: 'Trabajo físico en curso',
  physical_finished: 'Trabajo físico terminado',
  results: 'Registro final',
  in_review: 'En revisión',
  correction_required: 'Corrección requerida',
  finished: 'Finalizado',
  not_performed: 'No realizado',
}
const target = (visit: Visit) =>
  visit.origin === 'checklist'
    ? `/checklists/${visit.id}${visit.startedAt ? '/start' : ''}`
    : `/routes/${visit.id}`
export function WorkRecovery() {
  const { visits } = useRepositories()
  const query = useQuery(useCallback((signal) => visits.recovery({ signal }), [visits]))
  if (query.status !== 'success' || !query.data)
    return <QueryState query={query} showHeading={false} />
  const data = query.data
  const entry = (visit: Visit, label: string) => (
    <Card key={visit.id} title={label}>
      <p>
        {visit.storeSnapshot?.name ?? `Tienda #${visit.storeId}`} ·{' '}
        {visit.origin === 'checklist' ? 'Checklist' : 'Atención'} ·{' '}
        {visit.phase ? phaseLabels[visit.phase] : 'Etapa no registrada'}
      </p>
      {visit.claimExpiresAt && !visit.startedAt && (
        <p>Reserva hasta {displayDate(visit.claimExpiresAt)}</p>
      )}
      <Link className="nf-link" to={target(visit)}>
        {visit.phase === 'in_review' ? 'Ver registro' : 'Continuar trabajo'}
      </Link>
    </Card>
  )
  return (
    <section aria-label="Recuperación de trabajos">
      {data.activeExecution && entry(data.activeExecution, 'Tienes un trabajo en curso')}
      {data.reservations.map((visit) => entry(visit, 'Pendiente de iniciar'))}
      {data.corrections.map((visit) => entry(visit, 'Corrección requerida'))}
      {data.inReview.map((visit) => entry(visit, 'En revisión'))}
    </section>
  )
}
