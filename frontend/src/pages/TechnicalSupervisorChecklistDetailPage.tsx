import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Alert, Badge, Button, Card, PageHeader, Textarea } from '../components/ui'
import { Modal } from '../components/ui/Modal'
import { EvidenceGallery } from '../components/EvidenceGallery'
import { displayDate } from '../utils/dates'
import { visitStatusLabels } from '../types/models'
import { errorMessage } from '../services/errors'
export default function TechnicalSupervisorChecklistDetailPage() {
  const { id } = useParams()
  const repos = useRepositories()
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const query = useQuery(
    useCallback(
      async (signal) => {
        const visit = await repos.checklists.get(Number(id), { signal })
        const store = await repos.stores.get(visit.storeId, { signal })
        return { visit, store }
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
        <p>Inicio: {displayDate(visit.startedAt)}</p>
        <p>Cierre: {displayDate(visit.completedAt)}</p>
        {visit.exception ? (
          <Alert success>
            Excepción: {visit.exception.reason}
            {visit.exception.approved !== undefined && (
              <p>
                {visit.exception.approved ? 'Aprobada' : 'Rechazada'} ·{' '}
                {visit.exception.reviewReason} · {displayDate(visit.exception.reviewedAt)}
              </p>
            )}
          </Alert>
        ) : (
          <p>
            {visit.endLocation
              ? 'Proximidad validada en demostración.'
              : 'Ubicación de cierre pendiente.'}
          </p>
        )}
        {visit.status === 'pending_approval' && (
          <div className="nf-actions">
            <Button
              onClick={() => {
                setDecision('approve')
                setReason('')
              }}
            >
              Aprobar excepción
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDecision('reject')
                setReason('')
              }}
            >
              Rechazar excepción
            </Button>
          </div>
        )}
      </Card>
      {visit.tasks.map((task) => {
        const answer = visit.answers.find((item) => item.taskId === task.id)
        return (
          <Card key={task.id} title={task.title}>
            <Badge>
              {answer?.result === 'conforme'
                ? 'Conforme'
                : answer?.result === 'no_conforme'
                  ? 'No conforme'
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
        title={decision === 'approve' ? 'Aprobar excepción GPS' : 'Rechazar excepción GPS'}
        busy={busy}
        onClose={() => setDecision(null)}
      >
        <Textarea
          label={
            decision === 'reject' ? 'Motivo de rechazo' : 'Observación de aprobación (opcional)'
          }
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && <Alert>{error}</Alert>}
        <Button
          disabled={busy || (decision === 'reject' && reason.trim().length < 10)}
          onClick={() => {
            if (!decision || busy) return
            setBusy(true)
            setError('')
            void repos.visits
              .reviewException(visit.id, decision === 'approve', reason)
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
