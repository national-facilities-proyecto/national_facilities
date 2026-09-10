import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import type { Store, Visit } from '../../types/models'
import { errorMessage } from '../../services/errors'
import { ChecklistTaskCard } from '../../components/ChecklistTaskCard'
import { ObservationDialog } from '../../components/ObservationDialog'
import { CameraModal } from '../technician/CameraModal'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { Modal } from '../../components/ui/Modal'
import { Alert, Button, Card, PageHeader, Textarea } from '../../components/ui'
import { QueryState } from '../../components/feedback/QueryState'
import { TicketReport } from '../tickets/TicketReport'
import { useVisitEditor } from './useVisitEditor'

export function VisitEditor({ id, origin }: { id: number; origin: Visit['origin'] }) {
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        const visit = await (origin === 'checklist'
          ? repos.checklists.get(id, { signal })
          : repos.visits.get(id, { signal }))
        const store = await repos.stores.get(visit.storeId, { signal })
        return { visit, store }
      },
      [id, origin, repos],
    ),
    false,
  )
  if (query.status !== 'success' || !query.data) return <QueryState query={query} />
  return <Editor key={id} initial={query.data.visit} store={query.data.store} />
}
function Editor({ initial, store }: { initial: Visit; store: Store }) {
  const {
    repos,
    navigate,
    visit,
    setVisit,
    step,
    setStep,
    dirty,
    saving,
    error,
    setError,
    reason,
    setReason,
    exceptionBusy,
    setExceptionBusy,
    latest,
    mustComplete,
    back,
    blocker,
    update,
    save,
    patchAnswer,
    capture,
    remove,
    finish,
    issues,
    doneTasks,
    editable,
  } = useVisitEditor(initial, store)
  if (!editable && step.kind !== 'success')
    return (
      <>
        <PageHeader title={visit.status === 'claimed' ? 'Inicia la visita' : 'Visita registrada'} />
        <Alert success>
          {visit.status === 'pending_approval'
            ? 'Esta visita está pendiente de aprobación del supervisor.'
            : visit.status === 'completed'
              ? 'Esta visita ya fue completada.'
              : 'Debes iniciar la visita con una ubicación reciente antes de ejecutar el trabajo.'}
        </Alert>
        <Link
          className="nf-link"
          to={visit.origin === 'checklist' ? `/checklists/${visit.id}` : back}
        >
          Volver
        </Link>
      </>
    )
  return (
    <>
      <Link className="nf-link" to={back}>
        ← Volver a {visit.origin === 'checklist' ? 'mis checklists' : 'mis rutas'}
      </Link>
      <PageHeader
        title={store.name}
        description={store.address}
        eyebrow={
          visit.origin === 'checklist'
            ? 'Checklist de actividades'
            : `Resolver ticket #${visit.ticketId}`
        }
      />
      {visit.ticketId && <TicketReport ticketId={visit.ticketId} />}
      <fieldset
        disabled={step.kind === 'validating' || saving || exceptionBusy || step.kind === 'success'}
        className="nf-editor-fields"
      >
        {visit.origin === 'checklist' ? (
          <>
            <div className="nf-progress" role="status">
              <span>
                {doneTasks} de {visit.tasks.length} tareas completadas
              </span>
              <progress
                max={visit.tasks.length}
                value={doneTasks}
                aria-label="Progreso del checklist"
              />
            </div>
            <section className="nf-list" aria-label="Tareas del checklist">
              {visit.tasks.map((task, index) => (
                <ChecklistTaskCard
                  key={task.id}
                  task={task}
                  order={index + 1}
                  answer={visit.answers.find((answer) => answer.taskId === task.id)}
                  onConforming={() => patchAnswer(task.id, { result: 'conforme', observation: '' })}
                  onNonConforming={() => setStep({ kind: 'observation', taskId: task.id })}
                  onCamera={() => setStep({ kind: 'camera', taskId: task.id })}
                  onRemove={(id) => remove(id, task.id)}
                />
              ))}
            </section>
          </>
        ) : (
          <Card title="Resolución del trabajo">
            <Textarea
              label="Descripción del trabajo realizado"
              rows={5}
              value={visit.workDescription}
              onChange={(event) => update({ workDescription: event.target.value })}
            />
            <EvidenceGallery ids={visit.evidenceIds} onRemove={(id) => remove(id)} />
            <Button variant="secondary" onClick={() => setStep({ kind: 'camera' })}>
              {visit.evidenceIds.length ? 'Repetir fotografía' : 'Tomar foto'}
            </Button>
          </Card>
        )}
        <Card title="Validación de cierre">
          {issues.length > 0 && (
            <details>
              <summary>{issues.length} requisitos pendientes</summary>
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="nf-actions">
            <Button
              onClick={() => {
                void finish()
              }}
            >
              Finalizar {visit.origin === 'checklist' ? 'checklist' : 'ticket'}
            </Button>
            <Button
              variant="secondary"
              disabled={!dirty}
              onClick={() => {
                void save().catch(() => undefined)
              }}
            >
              Guardar borrador
            </Button>
          </div>
        </Card>
      </fieldset>
      <p role="status" aria-live="polite">
        {step.kind === 'validating'
          ? 'Solicitando ubicación nueva y validando…'
          : saving
            ? 'Guardando borrador…'
            : dirty
              ? 'Cambios pendientes de guardar.'
              : 'Borrador guardado.'}
      </p>
      {error && <Alert>{error}</Alert>}
      {blocker.state === 'blocked' ? (
        <Modal
          open
          title={mustComplete ? 'Checklist en curso' : 'Cambios sin guardar'}
          onClose={() => blocker.reset()}
        >
          {mustComplete ? (
            <>
              <p>Finaliza el checklist antes de salir de esta pantalla.</p>
              <Button onClick={() => blocker.reset()}>Continuar checklist</Button>
            </>
          ) : (
            <>
              <p>Hay cambios pendientes. Espera a que se guarden antes de salir.</p>
              <Button
                onClick={() => {
                  void save()
                    .then(() => blocker.proceed())
                    .catch(() => blocker.reset())
                }}
              >
                Guardar y salir
              </Button>
              <Button variant="secondary" onClick={() => blocker.reset()}>
                Continuar editando
              </Button>
            </>
          )}
        </Modal>
      ) : (
        <>
          <ObservationDialog
            key={step.kind === 'observation' ? step.taskId : 'closed'}
            open={step.kind === 'observation'}
            initialValue={
              step.kind === 'observation'
                ? (visit.answers.find((answer) => answer.taskId === step.taskId)?.observation ?? '')
                : ''
            }
            onCancel={() => setStep({ kind: 'editing' })}
            onSave={(value) => {
              if (step.kind === 'observation')
                patchAnswer(step.taskId, { result: 'no_conforme', observation: value })
              setStep({ kind: 'editing' })
            }}
          />
          <CameraModal
            open={step.kind === 'camera'}
            onClose={() => setStep({ kind: 'editing' })}
            onCapture={capture}
          />
          <Modal
            open={step.kind === 'location_error'}
            title="No se pudo finalizar"
            onClose={() => setStep({ kind: 'editing' })}
          >
            {step.kind === 'location_error' && (
              <>
                <Alert>{step.message}</Alert>
                <Button onClick={() => setStep({ kind: 'editing' })}>Volver y reintentar</Button>
                {['denied', 'timeout', 'unavailable'].includes(step.failure) && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setReason('')
                      setStep({ kind: 'exception', failure: step.failure })
                    }}
                  >
                    Solicitar excepción GPS
                  </Button>
                )}
              </>
            )}
          </Modal>
          <Modal
            open={step.kind === 'exception'}
            title="Excepción de ubicación"
            busy={exceptionBusy}
            onClose={() => setStep({ kind: 'editing' })}
          >
            <Textarea
              label="Justificación de la excepción"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={10}
            />
            <p>
              El supervisor revisará la solicitud. La visita no se marcará como completada todavía.
            </p>
            <Button
              disabled={exceptionBusy || reason.trim().length < 10}
              onClick={() => {
                if (step.kind !== 'exception' || exceptionBusy) return
                setExceptionBusy(true)
                void repos.visits
                  .requestException(visit.id, reason, step.failure)
                  .then((next) => {
                    setVisit(next)
                    latest.current = next
                    setStep({ kind: 'success', pending: true })
                  })
                  .catch((cause) => {
                    setError(errorMessage(cause))
                    setStep({ kind: 'editing' })
                  })
                  .finally(() => setExceptionBusy(false))
              }}
            >
              Enviar justificación
            </Button>
          </Modal>
          <Modal
            open={step.kind === 'success'}
            title={
              step.kind === 'success' && step.pending
                ? 'Pendiente de validación'
                : 'Trabajo completado'
            }
            onClose={() => void navigate(back)}
          >
            <p>
              {step.kind === 'success' && step.pending
                ? 'La excepción se envió al supervisor de cuenta.'
                : 'El trabajo se registró correctamente.'}
            </p>
            <Button onClick={() => void navigate(back)}>Volver al listado</Button>
          </Modal>
        </>
      )}
    </>
  )
}
