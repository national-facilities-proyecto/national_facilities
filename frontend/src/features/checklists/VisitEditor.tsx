import { useCallback, useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { registrationEditable, visitStatusLabels, type Store, type Visit } from '../../types/models'
import { AppError, errorMessage } from '../../services/errors'
import { ChecklistTaskCard } from '../../components/ChecklistTaskCard'
import { ObservationDialog } from '../../components/ObservationDialog'
import { CameraModal } from '../technician/CameraModal'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { Modal } from '../../components/ui/Modal'
import { Alert, Badge, Button, Card, PageHeader, Textarea } from '../../components/ui'
import { QueryState } from '../../components/feedback/QueryState'
import { TicketReport } from '../tickets/TicketReport'
import { useVisitEditor } from './useVisitEditor'
import { ChecklistTimer } from './ChecklistTimer'
import { validateFiles } from '../../services/evidence'
import { distanceMeters } from '../geolocation/location'
import { serverTime, formExpired } from './clock'
import { PendingVisit } from './PendingVisit'
import { VisitRecord } from './VisitRecord'
import { useAuth } from '../auth/AuthProvider'
import { ExceptionHistory } from './ExceptionHistory'
import { ChecklistPhotos } from './ChecklistPhotos'

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
  const expiryPrompted = useRef<string | undefined>(undefined)
  const galleryInput = useRef<HTMLInputElement>(null)
  const galleryTaskId = useRef<number | undefined>()
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
    confirmFinish,
    issues,
    doneTasks,
    editable,
    openForm,
    openingFailure,
    conflict,
    remote,
    consultRemote,
    acceptRemote,
    reconcile,
    pendingPhoto,
    corrections,
    setCorrections,
    reviewInput,
  } = useVisitEditor(initial)
  const [elapsed, setElapsed] = useState(0)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    const updateClock = () => {
      setElapsed(
        visit.startedAt
          ? Math.max(0, Math.floor((serverTime(visit) - Date.parse(visit.startedAt)) / 1000))
          : 0,
      )
      setExpired(formExpired(visit))
    }
    updateClock()
    const timer = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timer)
  }, [visit])
  useEffect(() => {
    if (!expired || visit.status !== 'in_progress' || !visit.expiresAt) return
    if (step.kind === 'time_exception') expiryPrompted.current = visit.expiresAt
    if (
      auth.status === 'authenticated' &&
      step.kind === 'editing' &&
      expiryPrompted.current !== visit.expiresAt
    ) {
      expiryPrompted.current = visit.expiresAt
      setStep({ kind: 'time_exception' })
    }
  }, [auth.status, expired, visit.status, visit.expiresAt, step.kind, setStep])
  if (visit.status === 'pending_approval' && !editable)
    return (
      <>
        <Link className="nf-link" to={back}>
          ← Volver al listado
        </Link>
        <PageHeader title={store.name} description={store.address} />
        <PendingVisit initial={visit} />
      </>
    )
  if (visit.status === 'in_progress' && !visit.formOpenedAt)
    return (
      <>
        <Link className="nf-link" to={back}>
          ← Volver al listado
        </Link>
        <PageHeader title={store.name} description={store.address} />
        {visit.ticketId && <TicketReport ticketId={visit.ticketId} />}
        <Card title="Trabajo en ejecución">
          <Badge>
            {visit.origin === 'checklist' ? 'En curso' : visitStatusLabels[visit.status]}
          </Badge>
          <p>
            Inicio real:{' '}
            {visit.startedAt ? new Date(visit.startedAt).toLocaleString('es-PE') : 'No registrado'}
          </p>
          <p role="status">
            Tiempo transcurrido: {Math.floor(elapsed / 60)} min {elapsed % 60} s.
          </p>
          <p>
            Realiza las tareas y reúne las fotografías. El plazo del formulario comienza al abrirlo.
          </p>
          {visit.tasks.length > 0 && (
            <ol>
              {visit.tasks.map((task) => (
                <li key={task.id}>{task.title}</li>
              ))}
            </ol>
          )}
          {visit.origin === 'checklist' && auth.session && (
            <ChecklistPhotos
              scope={`${repos.source}:${auth.session.user.id}:${visit.id}`}
              tasks={visit.tasks}
            />
          )}
          <Button disabled={saving} onClick={() => void openForm()}>
            {saving
              ? 'Abriendo…'
              : visit.origin === 'checklist'
                ? 'Finalizar checklist'
                : 'Registrar resolución'}
          </Button>
          {error && <Alert>{error}</Alert>}
          {visit.origin === 'checklist' &&
            openingFailure &&
            ['denied', 'timeout', 'unavailable'].includes(openingFailure) && (
              <>
                <p>
                  El envío requerirá GPS válido o una justificación de ubicación revisada por el
                  supervisor.
                </p>
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void openForm(openingFailure)}
                >
                  Continuar al formulario sin GPS
                </Button>
              </>
            )}
        </Card>
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
      <Badge>
        {visit.origin === 'checklist' && visit.status === 'in_progress'
          ? 'En curso'
          : visitStatusLabels[visit.status]}
      </Badge>
      {visit.status === 'pending_approval' && (
        <Card title="En revisión">
          <p>
            Completa o corrige este mismo formulario y envíalo al supervisor de National Facilities.
            El vencimiento original se conserva.
          </p>
          {(visit.exceptions ?? []).map((item) => (
            <div key={item.id}>
              {item.approved === false && (
                <Alert>Justificación rechazada: {item.reviewReason}</Alert>
              )}
              <Textarea
                label={
                  item.type === 'time_limit' ? 'Justificación de la demora' : 'Justificación GPS'
                }
                minLength={10}
                maxLength={500}
                value={corrections[item.type] ?? item.reason}
                onChange={(event) =>
                  setCorrections((current) => ({ ...current, [item.type]: event.target.value }))
                }
              />
            </div>
          ))}
          {expired && !visit.exceptions?.some((item) => item.type === 'time_limit') && (
            <Textarea
              label="Justificación de la demora"
              minLength={10}
              maxLength={500}
              value={corrections.time_limit ?? ''}
              onChange={(event) =>
                setCorrections((current) => ({ ...current, time_limit: event.target.value }))
              }
            />
          )}
        </Card>
      )}
      <ChecklistTimer visit={visit} />
      {expired && visit.status === 'in_progress' && (
        <Card title="Justificación requerida">
          <p>
            El trabajo sigue En proceso y el borrador está conservado. Explica la demora en el
            registro del formulario; al enviar la justificación pasará a En revisión.
          </p>
          <Button
            onClick={() => {
              setStep({ kind: 'time_exception' })
            }}
          >
            Justificar vencimiento
          </Button>
        </Card>
      )}
      <input
        ref={galleryInput}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          const taskId = galleryTaskId.current
          const existing = taskId
            ? (visit.answers.find((answer) => answer.taskId === taskId)?.evidenceIds.length ?? 0)
            : visit.evidenceIds.length
          const result = validateFiles([file], existing)
          if (!result.accepted.length) {
            setError(result.errors.join(' '))
            return
          }
          const accepted = result.accepted[0]
          void capture(
            {
              id: crypto.randomUUID(),
              blob: accepted,
              name: accepted.name,
              mimeType: accepted.type,
              size: accepted.size,
              source: 'gallery',
            },
            taskId,
          ).catch((cause) => setError(errorMessage(cause)))
        }}
      />
      <fieldset
        disabled={step.kind === 'validating' || saving || exceptionBusy || step.kind === 'success'}
        className="nf-editor-fields"
      >
        {visit.origin === 'checklist' ? (
          <>
            {auth.session && (
              <ChecklistPhotos
                scope={`${repos.source}:${auth.session.user.id}:${visit.id}`}
                tasks={visit.tasks}
                onAssociate={async (photo, taskId) => {
                  const count =
                    visit.answers.find((answer) => answer.taskId === taskId)?.evidenceIds.length ??
                    0
                  const validation = validateFiles(
                    [new File([photo.blob], photo.name, { type: photo.mimeType })],
                    count,
                  )
                  if (validation.errors.length)
                    throw new AppError('validation', validation.errors.join(' '))
                  await capture(photo, taskId)
                }}
              />
            )}
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
                  onGallery={() => {
                    galleryTaskId.current = task.id
                    galleryInput.current?.click()
                  }}
                  onRemove={(id) => remove(id, task.id)}
                  onNotApplicable={() =>
                    patchAnswer(task.id, { result: 'no_aplica', observation: '' })
                  }
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
              {visit.status === 'pending_approval'
                ? 'Enviar para revisión'
                : `Finalizar ${visit.origin === 'checklist' ? 'checklist' : 'ticket'}`}
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
      <ExceptionHistory visit={visit} />
      {pendingPhoto && (
        <Alert>
          La fotografía {pendingPhoto.photo.name} sigue pendiente de confirmar. Conservamos la
          selección en este editor.
          <Button
            disabled={saving || conflict}
            onClick={() =>
              void capture(pendingPhoto.photo, pendingPhoto.taskId).catch((cause) =>
                setError(errorMessage(cause)),
              )
            }
          >
            Reintentar carga
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
                Versión del servidor: {remote.revision}. Estado: {remote.status}.
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
          ? 'Solicitando ubicación nueva y validando…'
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
            open={step.kind === 'confirm_finish'}
            title="Confirmar ubicación de cierre"
            onClose={() => setStep({ kind: 'editing' })}
          >
            {step.kind === 'confirm_finish' && (
              <>
                <p>Distancia: {Math.round(distanceMeters(step.location, store))} m.</p>
                <p>
                  Precisión: ±{Math.round(step.location.accuracy)} m. Radio permitido:{' '}
                  {visit.radiusMeters} m.
                </p>
                <p>Capturada: {new Date(step.location.capturedAt).toLocaleString('es-PE')}.</p>
                <Button onClick={() => void confirmFinish(step.location)}>
                  Confirmar finalización
                </Button>
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
                void save()
                  .then(() => {
                    if (latest.current.status === 'pending_approval') {
                      if (!repos.visits.submitReview) throw new Error('Falta envío para revisión.')
                      return repos.visits.submitReview(
                        visit.id,
                        reviewInput(undefined, step.failure, reason),
                      )
                    }
                    return repos.visits.requestException(visit.id, reason, step.failure)
                  })
                  .then((next) => {
                    setVisit(next)
                    latest.current = next
                    setStep(
                      registrationEditable(next)
                        ? { kind: 'editing' }
                        : { kind: 'success', pending: true },
                    )
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
            open={step.kind === 'time_exception' && auth.status === 'authenticated'}
            title="Justificación por demora"
            busy={exceptionBusy}
            onClose={() => setStep({ kind: 'editing' })}
          >
            <Alert>Venció el plazo de cinco minutos para registrar el formulario.</Alert>
            <p>
              Explica por qué te demoraste o no pudiste completar el formulario. La justificación
              será revisada por el supervisor de National Facilities. Se conserva el plazo original.
            </p>
            <p>
              Inicio:{' '}
              {visit.startedAt
                ? new Date(visit.startedAt).toLocaleString('es-PE')
                : 'No registrado'}
            </p>
            <p>
              Vencimiento:{' '}
              {visit.expiresAt
                ? new Date(visit.expiresAt).toLocaleString('es-PE')
                : 'No registrado'}
            </p>
            <Textarea
              label="Justificación obligatoria"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              disabled={exceptionBusy || reason.trim().length < 10}
              onClick={() => {
                if (step.kind !== 'time_exception' || exceptionBusy) return
                setExceptionBusy(true)
                void save()
                  .then(() => repos.visits.requestTimeException(visit.id, reason))
                  .then((next) => {
                    setVisit(next)
                    latest.current = next
                    setStep(
                      registrationEditable(next)
                        ? { kind: 'editing' }
                        : { kind: 'success', pending: true },
                    )
                  })
                  .catch((cause) => {
                    setError(errorMessage(cause))
                    setStep({ kind: 'editing' })
                  })
                  .finally(() => setExceptionBusy(false))
              }}
            >
              {issues.length ? 'Guardar justificación y continuar' : 'Enviar para revisión'}
            </Button>
          </Modal>
          <Modal
            open={step.kind === 'success'}
            title={step.kind === 'success' && step.pending ? 'En revisión' : 'Trabajo finalizado'}
            onClose={() => void navigate(back)}
          >
            <p>
              {step.kind === 'success' && step.pending
                ? 'La justificación se envió al supervisor de National Facilities.'
                : 'El trabajo se registró correctamente.'}
            </p>
            <Button onClick={() => void navigate(back)}>Volver al listado</Button>
          </Modal>
        </>
      )}
    </>
  )
}
