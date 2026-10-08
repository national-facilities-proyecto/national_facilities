import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Alert, Badge, Button, Card, PageHeader, Textarea } from '../components/ui'
import { Disclosure } from '../components/ui/Disclosure'
import { Modal } from '../components/ui/Modal'
import { VisitTiming } from '../features/checklists/VisitTiming'
import { VisitResults } from '../features/checklists/VisitResults'
import { ExceptionSummary } from '../features/checklists/ExceptionSummary'
import { ExceptionDetails } from '../features/checklists/ExceptionDetails'
import { ExceptionHistory } from '../features/checklists/ExceptionHistory'
import { exceptionLabel, visitStatusLabels } from '../types/models'
import { displayDate } from '../utils/dates'
import { AppError, errorMessage } from '../services/errors'

export default function TechnicalSupervisorChecklistDetailPage() {
  const { id } = useParams()
  const repos = useRepositories()
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [exceptionId, setExceptionId] = useState<number>()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
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
  const exceptions = visit.exceptions?.length
    ? visit.exceptions
    : visit.exception
      ? [visit.exception]
      : []
  const pending = exceptions.filter((item) => item.approved === undefined)
  const resolved = exceptions.filter((item) => item.approved !== undefined)
  const history = visit.exceptionHistory ?? []
  const resolvedWithoutEvent = resolved.filter(
    (item) =>
      !history.some(
        (entry) =>
          item.id !== undefined &&
          entry.exception.id === item.id &&
          entry.exception.revision === item.revision &&
          entry.exception.approved === item.approved &&
          entry.exception.reason === item.reason &&
          entry.exception.reviewReason === item.reviewReason,
      ),
  )
  const reviewable =
    ['in_review', 'correction_required'].includes(visit.phase ?? '') && Boolean(visit.submittedAt)
  const selected = exceptions.find((item) => item.id === exceptionId)
  const showDecision = (id: number | undefined, value: 'approve' | 'reject') => {
    setExceptionId(id)
    setDecision(value)
    setReason('')
    setError('')
    setFieldErrors([])
    setTouched(false)
  }
  const reasonErrors =
    touched && reason.trim().length < 10
      ? ['Escribe al menos 10 caracteres para justificar la decisión.']
      : fieldErrors
  return (
    <>
      <Link className="nf-link" to="/technical-supervisor/checklists">
        ← Checklists y excepciones
      </Link>
      <PageHeader title={store.name} description={store.address} eyebrow="Revisión de visita" />
      <Card>
        <div className="nf-visit-summary">
          <div>
            <span>Técnico</span>
            <strong>{visit.technicianName?.trim() || 'Nombre no registrado'}</strong>
          </div>
          <div>
            <span>Fecha de visita</span>
            <strong>{displayDate(visit.startedAt ?? visit.scheduledAt)}</strong>
          </div>
          <Badge>{visitStatusLabels[visit.status]}</Badge>
        </div>
      </Card>
      <section className="nf-list" aria-label="Excepciones pendientes">
        <h2>
          {pending.length
            ? `${pending.length} ${pending.length === 1 ? 'excepción pendiente' : 'excepciones pendientes'}`
            : 'Sin excepciones pendientes'}
        </h2>
        {pending.map((item, index) => (
          <ExceptionSummary
            key={item.id ?? index}
            item={item}
            actions={
              reviewable && item.id !== undefined ? (
                <>
                  <Button onClick={() => showDecision(item.id, 'approve')}>Aprobar</Button>
                  <Button variant="secondary" onClick={() => showDecision(item.id, 'reject')}>
                    Rechazar
                  </Button>
                </>
              ) : undefined
            }
          />
        ))}
        {pending.length > 0 && !reviewable && (
          <p className="nf-muted">
            El técnico debe enviar el registro antes de que puedas decidir.
          </p>
        )}
      </section>
      <Disclosure title="Resultados del checklist y trabajo">
        <VisitResults visit={visit} />
      </Disclosure>
      {Boolean(resolved.length || visit.exceptionHistory?.length) && (
        <Disclosure title="Historial de excepciones">
          {resolvedWithoutEvent.map((item, index) => (
            <ExceptionSummary key={item.id ?? index} item={item} />
          ))}
          <ExceptionHistory visit={visit} />
        </Disclosure>
      )}
      <Disclosure title="Detalles técnicos">
        <VisitTiming visit={visit} />
        {exceptions.map((item, index) => (
          <ExceptionDetails key={item.id ?? index} item={item} radius={visit.radiusMeters} />
        ))}
      </Disclosure>
      <Modal
        open={decision !== null}
        title={decision === 'approve' ? 'Aprobar excepción' : 'Rechazar excepción'}
        busy={busy}
        onClose={() => setDecision(null)}
      >
        <form
          className="nf-form"
          onSubmit={(event) => {
            event.preventDefault()
            setTouched(true)
            if (
              !decision ||
              busy ||
              !selected ||
              selected.id === undefined ||
              reason.trim().length < 10
            )
              return
            setBusy(true)
            setError('')
            setFieldErrors([])
            void repos.visits
              .reviewException(visit.id, decision === 'approve', reason.trim(), selected.id, {
                revision: visit.revision ?? 0,
                exceptionRevision: selected.revision ?? 0,
              })
              .then(() => {
                setDecision(null)
                query.reload()
              })
              .catch((cause) => {
                if (cause instanceof AppError && cause.fields.reason?.length)
                  setFieldErrors(cause.fields.reason)
                else setError(errorMessage(cause))
              })
              .finally(() => setBusy(false))
          }}
        >
          {selected && (
            <div className="nf-decision-context">
              <strong>{exceptionLabel(selected)}</strong>
              <p>{selected.reason}</p>
            </div>
          )}
          <p className="nf-muted">Justifica tu decisión con al menos 10 caracteres.</p>
          <Textarea
            label={decision === 'reject' ? 'Motivo de rechazo' : 'Motivo de aprobación'}
            value={reason}
            errors={reasonErrors}
            disabled={busy}
            autoFocus
            rows={3}
            onBlur={() => setTouched(true)}
            onChange={(event) => {
              setReason(event.target.value)
              setTouched(true)
              setFieldErrors([])
            }}
          />
          {error && (
            <Alert>
              {error}
              <div className="nf-actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setDecision(null)
                    setError('')
                    query.reload()
                  }}
                >
                  Actualizar revisión
                </Button>
              </div>
            </Alert>
          )}
          <div className="nf-actions nf-modal-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setDecision(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando decisión…' : 'Confirmar decisión'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
