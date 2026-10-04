import { useId, useState } from 'react'
import { useRepositories } from '../../app/RepositoriesProvider'
import { Alert, Button, Input, Select } from '../../components/ui'
import { Modal } from '../../components/ui/Modal'
import type { AdminEntities, AdminKind, ChecklistTask } from '../../types/models'
import { localDate } from '../../utils/dates'
import { normalizeRole } from '../auth/session'
import { AppError, errorMessage, required } from '../../services/errors'
import { titles, getAdminFields, type Entity } from './fields'
import { TemplateItems } from './TemplateItems'
import { pastedCoordinatePair, storeCoordinate } from './storeCoordinates'

export function AdminForm({
  kind,
  original,
  stores,
  clients,
  templates,
  onClose,
}: {
  kind: AdminKind
  original?: Entity
  stores: AdminEntities['stores'][]
  clients: AdminEntities['clients'][]
  templates: AdminEntities['templates'][]
  onClose(this: void): void
}) {
  const repos = useRepositories()
  const [values, setValues] = useState<Record<string, string>>(() => {
    const entries = original
      ? Object.fromEntries(
          Object.entries(original)
            .filter(([, value]) => typeof value !== 'object')
            .map(([key, value]) => [key, String(value)]),
        )
      : {}
    return {
      role: 'technician',
      clientId: String(clients[0]?.id ?? ''),
      templateId: String(templates[0]?.id ?? ''),
      startDate: localDate(),
      monthlyVisits: '1',
      monthlyInterventions: '2',
      radiusMeters: '100',
      version: '1',
      ...entries,
    }
  })
  const [active, setActive] = useState(original && 'active' in original ? original.active : true)
  const [storeIds, setStoreIds] = useState<number[]>(
    original && 'storeIds' in original ? original.storeIds : [],
  )
  const [tasks, setTasks] = useState<ChecklistTask[]>(
    original && 'tasks' in original ? original.tasks : [],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [confirm, setConfirm] = useState(false)
  const [coordinatePreview, setCoordinatePreview] = useState<{
    latitude: number
    longitude: number
  }>()
  const coordinateHelpId = useId()
  const fields = getAdminFields(clients, templates)
  const build = (): Entity => {
    const id = original?.id ?? 0
    const text = (name: string) => values[name]?.trim() ?? ''
    const num = (name: string) => Number(values[name])
    for (const field of fields[kind])
      required(field.optional || text(field.name), `Completa ${field.label}.`)
    if (kind === 'users') {
      required(original || text('password'), 'La contraseña inicial es obligatoria.')
      const role = normalizeRole(text('role'))
      required(role, 'Selecciona un rol válido.')
      required(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text('email')), 'El correo no es válido.')
      required(
        text('role') !== 'store_supervisor' || storeIds.length === 1,
        'El supervisor de tienda debe tener exactamente una tienda.',
      )
      return {
        id,
        name: text('name'),
        email: text('email'),
        role,
        username: text('username'),
        ...(text('password') ? { password: values.password } : {}),
        storeIds,
        active,
        passwordInitialized:
          original && 'passwordInitialized' in original ? original.passwordInitialized : false,
      }
    }
    if (kind === 'stores') {
      return {
        id,
        name: text('name'),
        address: text('address'),
        contact: text('contact'),
        clientId: num('clientId'),
        latitude: storeCoordinate(text('latitude'), 'latitude'),
        longitude: storeCoordinate(text('longitude'), 'longitude'),
        active,
      }
    }
    if (kind === 'clients')
      return {
        id,
        name: text('name'),
        taxId: text('taxId'),
        email: text('email'),
      }
    if (kind === 'contracts') {
      required(
        ['monthlyVisits', 'monthlyInterventions', 'radiusMeters'].every(
          (key) => Number.isInteger(num(key)) && num(key) > 0,
        ),
        'Frecuencias y radio deben ser enteros mayores que cero.',
      )
      required(
        num('monthlyInterventions') >= 2,
        'Cada tienda requiere al menos dos intervenciones mensuales.',
      )
      required(
        !text('endDate') || text('endDate') >= text('startDate'),
        'La fecha final debe ser posterior al inicio.',
      )
      return {
        id,
        clientId: num('clientId'),
        templateId: num('templateId'),
        startDate: text('startDate'),
        endDate: text('endDate'),
        monthlyVisits: num('monthlyVisits'),
        monthlyInterventions: num('monthlyInterventions'),
        radiusMeters: num('radiusMeters'),
        active,
      }
    }
    required(
      tasks.length && tasks.every((task) => task.title.trim()),
      'Agrega al menos un ítem con descripción.',
    )
    required(
      Number.isInteger(num('version')) && num('version') > 0,
      'La versión debe ser un entero positivo.',
    )
    return {
      id,
      name: text('name'),
      version: num('version'),
      active,
      tasks: tasks.map((task, index) => ({ ...task, order: index + 1 })),
    }
  }
  return (
    <Modal
      open
      title={`${original ? 'Editar' : 'Crear'} · ${titles[kind]}`}
      busy={busy}
      onClose={onClose}
    >
      {confirm ? (
        <>
          <p>Confirma los cambios que se guardarán en el servidor.</p>
          {kind === 'stores' && coordinatePreview && (
            <p>
              Ubicación que se guardará: latitud {coordinatePreview.latitude.toFixed(6)}, longitud{' '}
              {coordinatePreview.longitude.toFixed(6)}.
            </p>
          )}
          <div className="nf-actions">
            <Button
              disabled={busy}
              onClick={() => {
                if (busy) return
                setBusy(true)
                try {
                  const entity = build()
                  void repos.administration
                    .save(kind, entity)
                    .then(onClose)
                    .catch((cause) => {
                      setError(errorMessage(cause))
                      setFieldErrors(cause instanceof AppError ? cause.fields : {})
                      setConfirm(false)
                    })
                    .finally(() => setBusy(false))
                } catch (cause) {
                  setError(errorMessage(cause))
                  setFieldErrors(cause instanceof AppError ? cause.fields : {})
                  setConfirm(false)
                  setBusy(false)
                }
              }}
            >
              Confirmar y guardar
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>
              Revisar formulario
            </Button>
          </div>
        </>
      ) : (
        <form
          className="nf-form"
          onSubmit={(event) => {
            event.preventDefault()
            setError('')
            setFieldErrors({})
            try {
              const entity = build()
              setCoordinatePreview(
                'latitude' in entity
                  ? { latitude: entity.latitude, longitude: entity.longitude }
                  : undefined,
              )
              setConfirm(true)
            } catch (cause) {
              setError(errorMessage(cause))
              setFieldErrors(cause instanceof AppError ? cause.fields : {})
            }
          }}
        >
          <div className="nf-two-columns">
            {fields[kind].map((field) =>
              field.options ? (
                <Select
                  key={field.name}
                  label={field.label}
                  errors={fieldErrors[field.name]}
                  required={!field.optional}
                  value={values[field.name] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                >
                  <option value="">Seleccionar</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  key={field.name}
                  label={field.label}
                  errors={fieldErrors[field.name]}
                  type={field.type ?? 'text'}
                  inputMode={field.inputMode}
                  placeholder={field.placeholder}
                  aria-describedby={
                    kind === 'stores' && (field.name === 'latitude' || field.name === 'longitude')
                      ? coordinateHelpId
                      : undefined
                  }
                  step={field.type === 'number' ? 'any' : undefined}
                  required={!field.optional}
                  value={values[field.name] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                  onPaste={(event) => {
                    if (
                      kind !== 'stores' ||
                      (field.name !== 'latitude' && field.name !== 'longitude')
                    )
                      return
                    const pair = pastedCoordinatePair(event.clipboardData.getData('text'))
                    if (!pair) return
                    event.preventDefault()
                    setValues((current) => ({ ...current, ...pair }))
                  }}
                />
              ),
            )}
          </div>
          {kind === 'stores' && (
            <p id={coordinateHelpId}>
              Latitud entre −90 y 90; longitud entre −180 y 180. Puedes pegar el par completo en
              cualquiera de los dos campos o escribir cada valor por separado, con punto o coma
              decimal. Las coordenadas se redondean a seis decimales al guardar; revisa la ubicación
              antes de confirmar.
            </p>
          )}
          {kind !== 'clients' && (
            <label className="nf-check">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />{' '}
              Registro activo
            </label>
          )}
          {kind === 'users' && (
            <fieldset>
              <legend>Tiendas visibles para el usuario</legend>
              {stores.map((store) => (
                <label className="nf-check" key={store.id}>
                  <input
                    type="checkbox"
                    checked={storeIds.includes(store.id)}
                    onChange={(event) =>
                      setStoreIds((current) =>
                        event.target.checked
                          ? [...current, store.id]
                          : current.filter((id) => id !== store.id),
                      )
                    }
                  />
                  {store.name}
                </label>
              ))}
            </fieldset>
          )}
          {kind === 'templates' && <TemplateItems tasks={tasks} setTasks={setTasks} />}
          {error && <Alert>{error}</Alert>}
          <Button type="submit">Revisar cambios</Button>
        </form>
      )}
    </Modal>
  )
}
