import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
import { Alert, Badge, Button, Card, Input, PageHeader } from '../../components/ui'
import { Modal } from '../../components/ui/Modal'
import { AppError, errorMessage } from '../../services/errors'
import type { ChecklistTask, Template } from '../../types/models'
import { useAuth } from '../auth/AuthProvider'
import { TemplateItems } from './TemplateItems'
import { buildTemplate, newTemplateTask } from './templateDraft'

const listPath = '/admin/templates'

export default function TemplateEditorPage() {
  const { id } = useParams()
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        if (!id || !/^\d+$/.test(id) || Number(id) <= 0) return null
        const templates = await repos.administration.list('templates', { signal })
        return templates.find((template) => template.id === Number(id)) ?? null
      },
      [id, repos],
    ),
    false,
  )
  if (!id) return <TemplateEditor key="new" />
  if (query.status !== 'success') return <QueryState query={query} />
  if (!query.data)
    return (
      <Alert>
        Plantilla no encontrada. <Link to={listPath}>Volver a plantillas</Link>
      </Alert>
    )
  return <TemplateEditor key={query.data.id} original={query.data} />
}

function TemplateEditor({ original }: { original?: Template }) {
  const repos = useRepositories()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [name, setName] = useState(original?.name ?? '')
  const [version, setVersion] = useState(String(original?.version ?? 1))
  const [active, setActive] = useState(original?.active ?? true)
  const [tasks, setTasks] = useState<ChecklistTask[]>(() => structuredClone(original?.tasks ?? []))
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [focusItem, setFocusItem] = useState<number | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const allowExit = useRef(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const reviewRef = useRef<HTMLElement>(null)
  const [baseline] = useState(() => JSON.stringify({ name, version, active, tasks }))
  const dirty = JSON.stringify({ name, version, active, tasks }) !== baseline
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      Boolean(session) &&
      !allowExit.current &&
      (dirty || busy) &&
      currentLocation.pathname !== nextLocation.pathname,
  )
  useBeforeUnload(
    useCallback(
      (event) => {
        if ((dirty || busy) && !allowExit.current) {
          event.preventDefault()
          event.returnValue = ''
        }
      },
      [dirty, busy],
    ),
  )
  useEffect(() => {
    if (focusItem === null) return
    const input = formRef.current?.querySelector<HTMLInputElement>(
      `[data-template-item-id="${focusItem}"] input`,
    )
    input?.focus({ preventScroll: true })
    input?.scrollIntoView({ block: 'center' })
  }, [focusItem])
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])
  useEffect(() => {
    if (review) reviewRef.current?.focus()
  }, [review])
  const build = () => buildTemplate(original?.id ?? 0, name, version, active, tasks)
  const clearError = (field?: string) => {
    setError('')
    if (field) setFieldErrors((current) => ({ ...current, [field]: [] }))
  }
  const updateTasks = (
    value: ChecklistTask[] | ((current: ChecklistTask[]) => ChecklistTask[]),
  ) => {
    setTasks(value)
    clearError()
  }
  const addItem = () => {
    const item = newTemplateTask(tasks)
    updateTasks([...tasks, item])
    setFocusItem(item.id)
  }
  const save = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await repos.administration.save('templates', build())
      allowExit.current = true
      await navigate(listPath)
    } catch (cause) {
      setReview(false)
      setError(errorMessage(cause))
      setFieldErrors(cause instanceof AppError ? cause.fields : {})
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="nf-template-editor">
      <Link className="nf-template-back" to={listPath}>
        <ArrowLeft size={18} aria-hidden="true" /> Volver a plantillas
      </Link>
      <PageHeader
        title={original ? 'Editar plantilla' : 'Nueva plantilla'}
        description="Configura los datos y los ítems del checklist. Revisa tus cambios antes de guardarlos."
      />
      {error && (
        <div ref={errorRef} tabIndex={-1}>
          <Alert>{error}</Alert>
        </div>
      )}
      {review ? (
        <section ref={reviewRef} tabIndex={-1} aria-label="Revisión de la plantilla">
          <Card title="Revisar plantilla">
            <p>Confirma los cambios que se guardarán en el servidor.</p>
            <dl className="nf-details nf-two-columns">
              <div>
                <dt>Nombre de plantilla</dt>
                <dd>{name.trim()}</dd>
              </div>
              <div>
                <dt>Versión</dt>
                <dd>{version}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{active ? 'Activa' : 'Inactiva'}</dd>
              </div>
              <div>
                <dt>Ítems</dt>
                <dd>{tasks.length}</dd>
              </div>
            </dl>
          </Card>
          <ol className="nf-template-review-items" aria-label="Ítems que se guardarán">
            {tasks.map((task, index) => (
              <li key={task.id}>
                <strong>
                  {index + 1}. {task.title}
                </strong>
                <div>
                  <Badge>{task.photoRequired ? 'Foto obligatoria' : 'Foto opcional'}</Badge>
                  <Badge>{task.active ? 'Activo' : 'Inactivo'}</Badge>
                </div>
              </li>
            ))}
          </ol>
          <footer className="nf-template-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setReview(false)}>
              Revisar formulario
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void save()
              }}
            >
              {busy ? 'Guardando…' : 'Confirmar y guardar'}
            </Button>
          </footer>
        </section>
      ) : (
        <form
          ref={formRef}
          className="nf-template-form"
          onSubmit={(event) => {
            event.preventDefault()
            setError('')
            setFieldErrors({})
            try {
              build()
              setReview(true)
            } catch (cause) {
              setError(errorMessage(cause))
            }
          }}
        >
          <Card title="Datos de la plantilla">
            <div className="nf-template-metadata">
              <div className="nf-template-name">
                <Input
                  label="Nombre de plantilla"
                  value={name}
                  required
                  errors={fieldErrors.name}
                  onChange={(event) => {
                    setName(event.target.value)
                    clearError('name')
                  }}
                />
              </div>
              <Input
                label="Versión"
                type="number"
                min={1}
                step={1}
                value={version}
                required
                errors={fieldErrors.version}
                onChange={(event) => {
                  setVersion(event.target.value)
                  clearError('version')
                }}
              />
              <label className="nf-check">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => {
                    setActive(event.target.checked)
                    clearError()
                  }}
                />
                Registro activo
              </label>
            </div>
          </Card>
          <TemplateItems tasks={tasks} setTasks={updateTasks} showAddButton={false} />
          <footer className="nf-template-actions">
            <Button variant="secondary" onClick={addItem}>
              <Plus size={18} aria-hidden="true" /> Agregar ítem
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void navigate(listPath)
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">Revisar cambios</Button>
          </footer>
        </form>
      )}
      {blocker.state === 'blocked' && (
        <Modal open title="Cambios sin guardar" busy={busy} onClose={() => blocker.reset()}>
          <p>
            Tienes cambios sin guardar en esta plantilla. Puedes seguir editando o salir y
            descartarlos.
          </p>
          <div className="nf-actions">
            <Button disabled={busy} onClick={() => blocker.reset()}>
              Seguir editando
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                allowExit.current = true
                blocker.proceed()
              }}
            >
              Salir sin guardar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
