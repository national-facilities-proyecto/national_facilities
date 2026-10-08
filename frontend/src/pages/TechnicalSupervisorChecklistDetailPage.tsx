import { VisitTiming } from '../features/checklists/VisitTiming'
import { ExceptionSummary } from '../features/checklists/ExceptionSummary'
import { AuditDetails } from '../features/checklists/AuditDetails'
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Alert, Badge, Button, Card, PageHeader, Textarea } from '../components/ui'
import { Modal } from '../components/ui/Modal'
import { EvidenceGallery } from '../components/EvidenceGallery'
import { exceptionLabel, visitStatusLabels } from '../types/models'
import { errorMessage } from '../services/errors'
import { ExceptionHistory } from '../features/checklists/ExceptionHistory'
import { ClaimHistory } from '../features/checklists/ClaimHistory'
export default function TechnicalSupervisorChecklistDetailPage() {
  const { id } = useParams()
  const repos = useRepositories()
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [exceptionId, setExceptionId] = useState<number>()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery(
    useCallback(
      async (signal) => {
        const visit = await repos.checklists.get(Number(id), { signal })
        const store = await repos.stores.get(visit.storeId, { signal })
        return { visit, store: { ...store, ...visit.storeSnapshot } }
      },
      [id, repos],
    ),
    false,
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { visit, store } = query.data
  return (
    <>
      <Link className="nf-link" to="/technical-supervisor/checklists">
        ← Checklists y excepciones
      </Link>
      <PageHeader
        title={`Detalle de visita #${visit.id}`}
        description={`${store.name} · ${store.address}`}
      />
      <Card title="Información de la visita">
        <Badge>{visitStatusLabels[visit.status]}</Badge>
        <VisitTiming visit={visit} />
        <p>
          {visit.startLocation?.validated === true
            ? 'Proximidad validada por el servidor.'
            : visit.startLocation
              ? 'La llegada no tiene una validación normal confirmada.'
              : 'Sin ubicación de llegada registrada.'}
        </p>
        {(visit.exceptions ?? []).map((item) => (
          <div key={item.id}>
            <ExceptionSummary item={item} />
            {item.type === 'location' && (
              <AuditDetails
                fields={[
                  ['Causa registrada', item.failure || 'No registrada'],
                  ['Latitud', item.telemetry?.latitude ?? 'Ausente'],
                  ['Longitud', item.telemetry?.longitude ?? 'Ausente'],
                  [
                    'Precisión',
                    item.telemetry?.accuracy != null
                      ? `${item.telemetry.accuracy} m`
                      : 'Sin registrar',
                  ],
                  [
                    'Distancia',
                    item.telemetry?.distanceMeters != null
                      ? `${item.telemetry.distanceMeters} m`
                      : 'Sin registrar',
                  ],
                  [
                    'Radio',
                    `${item.telemetry?.radiusMeters ?? visit.radiusMeters ?? 'Sin registrar'} m`,
                  ],
                ]}
              />
            )}
          </div>
        ))}
        {['in_review', 'correction_required'].includes(visit.phase ?? '') &&
          visit.submittedAt &&
          (visit.exceptions ?? [])
            .filter((item) => item.approved === undefined)
            .map((item) => (
              <div className="nf-actions" key={item.id}>
                <p>
                  {exceptionLabel(item)}: {item.reason}
                </p>
                <Button
                  onClick={() => {
                    setExceptionId(item.id)
                    setDecision('approve')
                    setReason('')
                  }}
                >
                  Aprobar excepción
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setExceptionId(item.id)
                    setDecision('reject')
                    setReason('')
                  }}
                >
                  Rechazar excepción
                </Button>
              </div>
            ))}
      </Card>
      <ExceptionHistory visit={visit} />
      <ClaimHistory visit={visit} />
      {visit.tasks.map((task) => {
        const answer = visit.answers.find((item) => item.taskId === task.id)
        return (
          <Card key={task.id} title={task.title}>
            <Badge>
              {answer?.result === 'conforme'
                ? 'Conforme'
                : answer?.result === 'no_conforme'
                  ? 'No conforme'
                  : answer?.result === 'no_aplica'
                    ? 'No aplica'
                    : 'Pendiente'}
            </Badge>
            <p>{answer?.observation}</p>
            <EvidenceGallery ids={answer?.evidenceIds ?? []} />
          </Card>
        )
      })}
      {visit.origin === 'ticket' && (
        <Card title="Trabajo realizado">
          <p>{visit.workDescription}</p>
          <EvidenceGallery ids={visit.evidenceIds} />
        </Card>
      )}
      <Modal
        open={decision !== null}
        title={decision === 'approve' ? 'Aprobar excepción' : 'Rechazar excepción'}
        busy={busy}
        onClose={() => setDecision(null)}
      >
        <Textarea
          label={decision === 'reject' ? 'Motivo de rechazo' : 'Motivo de aprobación'}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && (
          <Alert>
            {error}
            <Button
              variant="secondary"
              onClick={() => {
                setDecision(null)
                setError('')
                query.reload()
              }}
            >
              Actualizar revisión
            </Button>
          </Alert>
        )}
        <Button
          disabled={busy || reason.trim().length < 10}
          onClick={() => {
            if (!decision || busy) return
            setBusy(true)
            setError('')
            void repos.visits
              .reviewException(visit.id, decision === 'approve', reason, exceptionId, {
                revision: visit.revision ?? 0,
                exceptionRevision:
                  visit.exceptions?.find((item) => item.id === exceptionId)?.revision ?? 0,
              })
              .then(() => {
                setDecision(null)
                query.reload()
              })
              .catch((cause) => setError(errorMessage(cause)))
              .finally(() => setBusy(false))
          }}
        >
          Confirmar decisión
        </Button>
      </Modal>
    </>
  )
}
