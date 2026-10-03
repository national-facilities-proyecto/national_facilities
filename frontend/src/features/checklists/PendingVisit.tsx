import { useState } from 'react'
import type { Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { Alert, Button, Card, Textarea } from '../../components/ui'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { useLocationRequest } from '../geolocation/useLocation'
import { LocationError } from '../geolocation/location'
import { errorMessage } from '../../services/errors'
import { formExpired } from './clock'
import { displayDate } from '../../utils/dates'
import { VisitRecord } from './VisitRecord'
import { ExceptionHistory } from './ExceptionHistory'

export function PendingVisit({ initial }: { initial: Visit }) {
  const repos = useRepositories()
  const location = useLocationRequest()
  const [visit, setVisit] = useState(initial)
  const [reason, setReason] = useState('')
  const [failure, setFailure] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const exceptions = visit.exceptions ?? []
  const act = (work: () => Promise<Visit>) => {
    if (busy) return
    setBusy(true)
    setError('')
    void work()
      .then(setVisit)
      .catch((cause) => {
        if (cause instanceof LocationError) setFailure(cause.reason)
        setError(errorMessage(cause))
      })
      .finally(() => setBusy(false))
  }
  if (visit.status === 'completed')
    return (
      <>
        <Alert success>Trabajo finalizado.</Alert>
        <VisitRecord visit={visit} />
      </>
    )
  return (
    <>
      <Card title="En revisión">
        <p>La justificación espera la decisión del supervisor de National Facilities.</p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Actualizar estado
        </Button>
        <p>Inicio: {displayDate(visit.startedAt)}</p>
        <p>
          Apertura: {displayDate(visit.formOpenedAt)} · Vencimiento: {displayDate(visit.expiresAt)}
        </p>
        <p>Envío registrado: {displayDate(visit.submittedAt)}</p>
        {exceptions.map((item) => (
          <Alert key={item.id} success>
            {item.type === 'time_limit' ? 'Tiempo' : 'GPS'}: {item.reason} · Autor:{' '}
            {item.authorId ? `Usuario #${item.authorId}` : 'No registrado'} ·{' '}
            {item.approved === undefined ? 'Pendiente' : item.approved ? 'Aprobada' : 'Rechazada'}
            {item.reviewReason && <p>Decisión: {item.reviewReason}</p>}
          </Alert>
        ))}
        <Textarea
          label="Motivo de la justificación pendiente"
          minLength={10}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {formExpired(visit) && !exceptions.some((item) => item.type === 'time_limit') && (
          <Button
            disabled={busy || reason.trim().length < 10}
            onClick={() => act(() => repos.visits.requestTimeException(visit.id, reason))}
          >
            Justificar vencimiento
          </Button>
        )}
        {!visit.endLocation && (
          <Button
            disabled={busy}
            onClick={() =>
              act(async () => {
                const gps = await location.request()
                if (!repos.visits.recordEndGps) throw new Error('Falta registro de GPS de cierre.')
                return repos.visits.recordEndGps(visit.id, gps)
              })
            }
          >
            Registrar GPS de cierre
          </Button>
        )}
        {['denied', 'timeout', 'unavailable'].includes(failure) &&
          !exceptions.some((item) => item.type === 'location') && (
            <Button
              disabled={busy || reason.trim().length < 10}
              onClick={() => act(() => repos.visits.requestException(visit.id, reason, failure))}
            >
              Enviar justificación GPS
            </Button>
          )}
        {error && <Alert>{error}</Alert>}
      </Card>
      <ExceptionHistory visit={visit} />
      {visit.tasks.map((task) => {
        const answer = visit.answers.find((item) => item.taskId === task.id)
        return (
          <Card key={task.id} title={task.title}>
            <p>
              {answer?.result ?? 'Resultado pendiente'} · {answer?.observation}
            </p>
            <EvidenceGallery ids={answer?.evidenceIds ?? []} />
          </Card>
        )
      })}
      {visit.origin === 'ticket' && (
        <Card title="Resolución guardada">
          <p>{visit.workDescription}</p>
          <EvidenceGallery ids={visit.evidenceIds} />
        </Card>
      )}
    </>
  )
}
