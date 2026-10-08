import { Disclosure } from '../../components/ui/Disclosure'
import { VisitStages } from './VisitStages'
import { taskIssues } from './validation'
import { submissionMessage } from './submissionMessage'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { exceptionLabel, operationalVisitLabel, type Store, type Visit } from '../../types/models'
import { errorMessage } from '../../services/errors'
import { ChecklistTaskCard } from '../../components/ChecklistTaskCard'
import { ObservationDialog } from '../../components/ObservationDialog'
import { CameraModal } from '../technician/CameraModal'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { Modal } from '../../components/ui/Modal'
import { Alert, Badge, Button, Card, PageHeader, Textarea } from '../../components/ui'
import { QueryState } from '../../components/feedback/QueryState'
import { TicketReport } from '../tickets/TicketReport'
import { useVisitEditor } from './useVisitEditor'
import { validateFiles } from '../../services/evidence'
import { PendingVisit } from './PendingVisit'
import { VisitRecord } from './VisitRecord'
import { useAuth } from '../auth/AuthProvider'
import { ExceptionHistory } from './ExceptionHistory'
import { ChecklistPhotos } from './ChecklistPhotos'
import { optimizeEvidenceImage } from '../../services/optimizeEvidenceImage'
import { NotPerformedAction } from './NotPerformedAction'
import { WorkRecovery } from './WorkRecovery'

export function VisitEditor({ id, origin }: { id: number; origin: Visit['origin'] }) {
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        const visit = await (origin === 'checklist'
          ? repos.checklists.get(id, { signal })
          : repos.visits.get(id, { signal }))
        const store = await repos.stores.get(visit.storeId, { signal })
        return { visit, store: { ...store, ...visit.storeSnapshot } }
      },
      [id, origin, repos],
    ),
    false,
  )
  if (query.status !== 'success' || !query.data) return <QueryState query={query} />
  return <Editor key={id} initial={query.data.visit} store={query.data.store} />
}
function Editor({ initial, store }: { initial: Visit; store: Store }) {
  const auth = useAuth()
  const galleryInput = useRef<HTMLInputElement>(null)
  const galleryTaskId = useRef<number | undefined>()
  const {
    repos,
    navigate,
    visit,
    step,
    setStep,
    dirty,
    saving,
    error,
    setError,
    mustComplete,
    back,
    blocker,
    update,
    save,
    patchAnswer,
    capture,
    remove,
    finish,
    confirmFinish,
    issues,
    doneTasks,
    editable,
    openForm,
    finishPhysicalWork,
    markNotPerformed,
    needsReview,
    conflict,
    remote,
    consultRemote,
    acceptRemote,
    reconcile,
    pendingPhoto,
    retryPendingPhoto,
    validationIssues,
    corrections,
    setCorrections,
  } = useVisitEditor(initial)
  const [optimizing, setOptimizing] = useState(false)
  if (visit.phase === 'in_review' && visit.submittedAt)
    return (
      <>
        <Link className="nf-link" to={back}>
          ← Volver al listado
        </Link>
        <PageHeader title={store.name} description={store.address} />
        <PendingVisit initial={visit} />
      </>
    )
  if (visit.phase === 'not_performed' || visit.status === 'cancelled')
    return (
      <>
        <PageHeader title="No realizado" description={store.name} />
        <Card>
          <p>
            No realizado no cuenta como trabajo completado. El intento permanece en el historial.
          </p>
          <Link className="nf-link" to={back}>
            {visit.origin === 'checklist' ? 'Ver obligaciones pendientes' : 'Volver a atenciones'}
          </Link>
        </Card>
        <WorkRecovery />
        <VisitRecord visit={visit} />
      </>
    )
  if (visit.phase === 'physical_work' || visit.phase === 'physical_finished')
    return (
      <>
        <Link className="nf-link" to={back}>
          ← Volver al listado
        </Link>
        <PageHeader title={store.name} description={store.address} />
        <VisitStages current={2} />
        {visit.ticketId && (
          <Disclosure title="Ver reporte de la incidencia">
            <TicketReport ticketId={visit.ticketId} />
          </Disclosure>
        )}
        <Card
          title={
            visit.phase === 'physical_work'
              ? visit.origin === 'checklist'
                ? 'Recorrido de inspección'
                : 'Atención en curso'
              : visit.origin === 'checklist'
                ? 'Recorrido terminado'
                : 'Atención terminada'
          }
        >
          {visit.gpsExceptionPending && <Badge>Llegada pendiente de revisión</Badge>}
          {visit.phase === 'physical_work' ? (
            <>
              {visit.tasks.length > 0 && (
                <div className="nf-walkthrough">
                  <p className="nf-muted">
                    {visit.tasks.length} {visit.tasks.length === 1 ? 'actividad' : 'actividades'}{' '}
                    para revisar
                  </p>
                  <ul>
                    {visit.tasks.map((task, index) => (
                      <li key={task.id}>
                        <span aria-hidden="true">{index + 1}</span>
                        <span>{task.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!visit.readOnly && (
                <div className="nf-primary-action">
                  <Button disabled={saving} onClick={() => void finishPhysicalWork()}>
                    {saving
                      ? 'Registrando fin…'
                      : visit.origin === 'checklist'
                        ? 'Terminar recorrido'
                        : 'Terminar atención'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            !visit.readOnly && (
              <div className="nf-primary-action">
                <p>Registra ahora los resultados y las fotografías.</p>
                <Button disabled={saving} onClick={() => void openForm()}>
                  {saving
                    ? 'Abriendo…'
                    : visit.origin === 'checklist'
                      ? 'Registrar resultados'
                      : 'Registrar resolución'}
                </Button>
              </div>
            )
          )}
          {visit.readOnly && <Alert>El servidor mantiene esta ejecución en solo lectura.</Alert>}
          {error && <Alert>{error}</Alert>}
          <NotPerformedAction
            visit={visit}
            disabled={saving || conflict || Boolean(pendingPhoto)}
            submit={markNotPerformed}
          />
        </Card>
      </>
    )
  if ((visit.phase === 'results' || visit.phase === 'correction_required') && !editable)
    return (
      <>
        <Link className="nf-link" to={back}>
          ← Volver al listado
        </Link>
        <PageHeader title={store.name} description={store.address} />
        <Card
          title={
            visit.phase === 'correction_required'
              ? 'Corrección requerida'
              : visit.origin === 'checklist'
                ? 'Registro de resultados'
                : 'Registro de resolución'
          }
        >
          <p>
            {visit.phase === 'correction_required'
              ? 'Corrección requerida en esta misma ejecución histórica.'
              : 'Continúas en el registro final de esta ejecución. Registro todavía no enviado.'}
          </p>
          {visit.readOnly && (
            <Alert>El servidor mantiene el registro histórico en solo lectura.</Alert>
          )}
        </Card>
        <VisitRecord visit={visit} />
      </>
    )
  if (!editable && step.kind !== 'success')
    return (
      <>
        <PageHeader title={visit.status === 'claimed' ? 'Inicia la visita' : 'Visita registrada'} />
        <Alert success>
          {visit.status === 'completed'
            ? 'Esta visita ya fue finalizada.'
            : 'Debes iniciar la visita con una ubicación reciente antes de ejecutar el trabajo.'}
        </Alert>
        {visit.status === 'completed' && <VisitRecord visit={visit} />}
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
        ← Volver a {visit.origin === 'checklist' ? 'mis checklists' : 'mis atenciones'}
      </Link>
      <PageHeader
        title={store.name}
        description={store.address}
        eyebrow={
          visit.origin === 'checklist'
            ? 'Checklist de actividades'
            : `Registrar resolución #${visit.ticketId}`
        }
      />
      <VisitStages current={3} />
      {visit.ticketId && (
        <Disclosure title="Ver reporte de la incidencia">
          <TicketReport ticketId={visit.ticketId} />
        </Disclosure>
      )}
      <Badge>
        {visit.origin === 'checklist' && visit.status === 'in_progress'
          ? 'En curso'
          : operationalVisitLabel(visit)}
      </Badge>
      {visit.phase === 'correction_required' && (
        <Card title="Corrección requerida">
          <p>
            Completa o corrige este mismo formulario y envíalo al supervisor de National Facilities.
            Se conservan las fotos y fechas originales. La presencia sigue sin validación normal.
          </p>
          {(visit.exceptions ?? [])
            .filter((item) => item.approved === false)
            .map((item) => (
              <div key={item.id}>
                {item.approved === false && (
                  <Alert>Justificación rechazada: {item.reviewReason}</Alert>
                )}
                <Textarea
                  label={
                    item.type === 'time_limit'
                      ? 'Justificación de la demora'
                      : `Justificación ${exceptionLabel(item)}`
                  }
                  minLength={10}
                  maxLength={500}
                  value={corrections[`${item.type}:${item.scope}`] ?? item.reason}
                  onChange={(event) =>
                    setCorrections((current) => ({
                      ...current,
                      [`${item.type}:${item.scope}`]: event.target.value,
                    }))
                  }
                />
                <EvidenceGallery ids={item.evidenceIds ?? []} />
              </div>
            ))}
        </Card>
      )}
      <input
        ref={galleryInput}
        aria-label="Seleccionar archivo de evidencia"
        tabIndex={-1}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file || optimizing || saving || conflict) return
          const taskId = galleryTaskId.current
          const existing = taskId
            ? (visit.answers.find((answer) => answer.taskId === taskId)?.evidenceIds.length ?? 0)
            : visit.evidenceIds.length
          const result = validateFiles([file], existing, true)
          if (!result.accepted.length) {
            setError(result.errors.join(' '))
            return
          }
          setOptimizing(true)
          void optimizeEvidenceImage(result.accepted[0])
            .then((accepted) =>
              capture(
                {
                  id: crypto.randomUUID(),
                  blob: accepted,
                  name: accepted.name,
                  mimeType: accepted.type,
                  size: accepted.size,
                  source: 'gallery',
                },
                taskId,
              ),
            )
            .catch((cause) => setError(errorMessage(cause)))
            .finally(() => setOptimizing(false))
        }}
      />
      <fieldset
        disabled={step.kind === 'validating' || saving || optimizing || step.kind === 'success'}
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
                  issues={
                    validationIssues.length
                      ? taskIssues(
                          task,
                          visit.answers.find((answer) => answer.taskId === task.id),
                        )
                      : []
                  }
                  onConforming={() => patchAnswer(task.id, { result: 'conforme', observation: '' })}
                  onNonConforming={() => setStep({ kind: 'observation', taskId: task.id })}
                  onCamera={() => setStep({ kind: 'camera', taskId: task.id })}
                  onGallery={() => {
                    galleryTaskId.current = task.id
                    galleryInput.current?.click()
                  }}
                  onRemove={(id) => remove(id, task.id)}
                  onNotApplicable={() => {
                    patchAnswer(task.id, { result: 'no_aplica' })
                    setStep({ kind: 'observation', taskId: task.id, result: 'no_aplica' })
                  }}
                />
              ))}
            </section>
            <Textarea
              label="Reporte general del checklist"
              rows={4}
              value={visit.workDescription}
              onChange={(event) => update({ workDescription: event.target.value })}
            />
          </>
        ) : (
          <Card title="Resolución del trabajo">
            {auth.session && (
              <ChecklistPhotos
                scope={`${repos.source}:${auth.session.user.id}:${visit.id}`}
                onAssociate={(photo) => capture(photo)}
              />
            )}
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
            <Button
              variant="secondary"
              onClick={() => {
                galleryTaskId.current = undefined
                galleryInput.current?.click()
              }}
            >
              Seleccionar de galería
            </Button>
          </Card>
        )}
        <Card title="Enviar resultados">
          {validationIssues.length > 0 && (
            <p role="alert" className="nf-task-issues">
              Completa los requisitos pendientes antes de enviar.
            </p>
          )}
          {issues.length > 0 && (
            <details
              open={validationIssues.length > 0 && visit.origin === 'ticket' ? true : undefined}
            >
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
              {needsReview ? 'Enviar a revisión' : 'Finalizar'}
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
      <NotPerformedAction
        visit={visit}
        disabled={saving || optimizing || conflict || Boolean(pendingPhoto)}
        submit={markNotPerformed}
      />
      {Boolean(visit.exceptionHistory?.length) && (
        <Disclosure title="Historial de excepciones">
          <ExceptionHistory visit={visit} />
        </Disclosure>
      )}
      {pendingPhoto && (
        <Alert>
          {pendingPhoto.confirmed
            ? 'La foto está guardada. Falta confirmar el guardado del resto del registro.'
            : 'La foto sigue pendiente de confirmar. Conservamos la selección para reintentar.'}
          <Button
            disabled={saving || conflict}
            onClick={() => void retryPendingPhoto().catch((cause) => setError(errorMessage(cause)))}
          >
            {pendingPhoto.confirmed ? 'Reintentar guardado' : 'Reintentar carga'}
          </Button>
        </Alert>
      )}
      {conflict && (
        <Card title="Borrador modificado en otra sesión">
          <p>
            Tu contenido permanece en el editor. Consulta la versión actual antes de decidir qué
            guardar.
          </p>
          <Button disabled={saving} onClick={() => void consultRemote()}>
            Consultar versión del servidor
          </Button>
          {remote && (
            <>
              <p>
                Versión del servidor: {remote.revision}. Estado: {operationalVisitLabel(remote)}.
              </p>
              <p>Descripción guardada: {remote.workDescription || 'Sin descripción'}</p>
              <ul>
                {remote.answers.map((answer) => (
                  <li key={answer.taskId}>
                    {visit.tasks.find((task) => task.id === answer.taskId)?.title}:{' '}
                    {answer.result ?? 'Pendiente'} · {answer.observation}
                  </li>
                ))}
              </ul>
              <Button onClick={acceptRemote}>Usar versión del servidor</Button>
              {remote.status === 'in_progress' && !remote.submittedAt && (
                <Button variant="secondary" onClick={reconcile}>
                  Guardar mis respuestas sobre esta versión
                </Button>
              )}
              <p>
                Guardar tus respuestas reemplaza los resultados y observaciones mostrados. Las
                fotografías confirmadas se conservan. Otro cambio concurrente producirá un nuevo
                conflicto.
              </p>
            </>
          )}
        </Card>
      )}
      <p role="status" aria-live="polite">
        {step.kind === 'validating'
          ? 'Validando y enviando registro…'
          : saving
            ? 'Guardando borrador…'
            : error
              ? 'No se confirmó el guardado. Conserva el editor y reintenta.'
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
                disabled={Boolean(pendingPhoto) || conflict}
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
                patchAnswer(step.taskId, {
                  result: step.result ?? 'no_conforme',
                  observation: value,
                })
              setStep({ kind: 'editing' })
            }}
          />
          <CameraModal
            open={step.kind === 'camera'}
            onClose={() => setStep({ kind: 'editing' })}
            onCapture={capture}
          />
          <Modal
            open={step.kind === 'confirm_finish'}
            title="Confirmar envío del registro"
            onClose={() => setStep({ kind: 'editing' })}
          >
            <p>
              {needsReview
                ? 'Enviarás los resultados al supervisor para su revisión.'
                : '¿Confirmas que los resultados están completos?'}
            </p>
            <div className="nf-actions nf-modal-actions">
              <Button variant="secondary" onClick={() => setStep({ kind: 'editing' })}>
                Revisar resultados
              </Button>
              <Button onClick={() => void confirmFinish()}>Confirmar envío</Button>
            </div>
          </Modal>
          <Modal
            open={step.kind === 'success'}
            title={
              step.kind === 'success' ? submissionMessage(step.status).title : 'Registro enviado'
            }
            onClose={() => void navigate(back)}
          >
            <p>{step.kind === 'success' && submissionMessage(step.status).description}</p>
            <div className="nf-actions nf-modal-actions">
              <Button onClick={() => void navigate(back)}>Volver al listado</Button>
            </div>
          </Modal>
        </>
      )}
    </>
  )
}
