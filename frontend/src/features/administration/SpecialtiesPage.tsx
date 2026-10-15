import { useCallback, useState } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { CircleCheck, X } from 'lucide-react'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
import { Alert, Badge, Button, Card, Input, PageHeader, Select } from '../../components/ui'
import { Modal } from '../../components/ui/Modal'
import { errorMessage } from '../../services/errors'
import type { ClientSpecialty, Specialty, Client } from '../../types/models'
import { useAuth } from '../auth/AuthProvider'

type Data = { clients: Client[]; specialties: Specialty[]; relations: ClientSpecialty[] }

export default function SpecialtiesPage() {
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        const [clients, specialties, relations] = await Promise.all([
          repos.administration.list('clients', { signal }),
          repos.administration.list('specialties', { signal }),
          repos.administration.list('clientSpecialties', { signal }),
        ])
        return { clients, specialties, relations }
      },
      [repos],
    ),
    false,
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  return <Workspace initial={query.data} />
}

function Workspace({ initial }: { initial: Data }) {
  const repos = useRepositories()
  const { session } = useAuth()
  const [data, setData] = useState(initial)
  const [tab, setTab] = useState<'client' | 'catalog'>('client')
  const [clientId, setClientId] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<Specialty | 'new' | null>(null)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const client = data.clients.find((item) => item.id === Number(clientId))
  const enabled = data.specialties.filter((item) => item.active)
  const selectedCount = enabled.filter((item) => selected.includes(item.id)).length
  const baseline = data.relations
    .filter((row) => row.clientId === Number(clientId) && row.active)
    .map((row) => row.categoryId)
  // Globally inactive specialties retain their client settings, but cannot be selected for reports.
  const dirty = enabled.some((item) => selected.includes(item.id) !== baseline.includes(item.id))
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      Boolean(session) && (dirty || busy) && currentLocation.pathname !== nextLocation.pathname,
  )
  useBeforeUnload((event) => {
    if (dirty || busy) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  function change(action: () => void) {
    if (dirty) setPending(() => action)
    else action()
  }
  function chooseClient(value: string) {
    setClientId(value)
    setSelected(
      data.relations
        .filter((row) => row.clientId === Number(value) && row.active)
        .map((row) => row.categoryId),
    )
    setError('')
    setMessage('')
  }
  async function save() {
    if (!client || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    let completed = 0
    const changes = enabled.filter(
      (item) => selected.includes(item.id) !== baseline.includes(item.id),
    )
    try {
      // Read again before creating relations: an existing disabled pair must be updated, never duplicated.
      const relations = await repos.administration.list('clientSpecialties')
      let savedRelations = relations
      const intended = new Set(
        relations
          .filter((row) => row.clientId === client.id && row.active)
          .map((row) => row.categoryId),
      )
      for (const item of changes) {
        if (selected.includes(item.id)) intended.add(item.id)
        else intended.delete(item.id)
      }
      setSelected([...intended])
      setData((current) => ({ ...current, relations }))
      for (const specialty of changes) {
        const existing = relations.find(
          (row) => row.clientId === client.id && row.categoryId === specialty.id,
        )
        const active = selected.includes(specialty.id)
        if (Boolean(existing?.active) === active) continue
        const saved = await repos.administration.save('clientSpecialties', {
          id: existing?.id ?? 0,
          clientId: client.id,
          categoryId: specialty.id,
          active,
        })
        completed++
        savedRelations = [...savedRelations.filter((row) => row.id !== saved.id), saved]
        setData((current) => ({
          ...current,
          relations: [...current.relations.filter((row) => row.id !== saved.id), saved],
        }))
      }
      setSelected(
        savedRelations
          .filter((row) => row.clientId === client.id && row.active)
          .map((row) => row.categoryId),
      )
      setMessage(`Especialidades de ${client.name} actualizadas correctamente.`)
    } catch (cause) {
      setError(
        `${completed ? `Se ${completed === 1 ? 'guardó 1 cambio' : `guardaron ${completed} cambios`}. Quedan cambios pendientes; puedes reintentar. ` : ''}${errorMessage(cause)}`,
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeader
        title="Especialidades"
        description="Define qué especialidades pueden utilizar los supervisores de las tiendas de cada cliente."
      />
      <div className="nf-actions" role="group" aria-label="Vistas de especialidades">
        <Button
          variant={tab === 'client' ? 'primary' : 'secondary'}
          aria-pressed={tab === 'client'}
          disabled={busy}
          onClick={() =>
            change(() => {
              setTab('client')
              setError('')
              setMessage('')
            })
          }
        >
          Por cliente
        </Button>
        <Button
          variant={tab === 'catalog' ? 'primary' : 'secondary'}
          aria-pressed={tab === 'catalog'}
          disabled={busy}
          onClick={() =>
            change(() => {
              chooseClient(clientId)
              setTab('catalog')
            })
          }
        >
          Catálogo de especialidades
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {message && (
        <div className="nf-specialty-notification">
          <CircleCheck size={24} aria-hidden="true" />
          <p role="status" aria-atomic="true">
            {message}
          </p>
          <Button
            variant="secondary"
            aria-label="Cerrar confirmación"
            onClick={() => setMessage('')}
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </div>
      )}
      {tab === 'client' ? (
        <Card>
          <h2>Especialidades por cliente</h2>
          <Select
            label="Cliente"
            value={clientId}
            disabled={busy || !data.clients.length}
            onChange={(event) => {
              const value = event.target.value
              change(() => chooseClient(value))
            }}
          >
            <option value="">Selecciona un cliente</option>
            {data.clients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          {!data.clients.length ? (
            <p>Primero crea un cliente en la sección Clientes.</p>
          ) : !client ? (
            <p>Elige un cliente para ver y configurar sus especialidades.</p>
          ) : (
            <>
              <p>
                Selecciona las especialidades que podrán utilizar los supervisores de las tiendas de{' '}
                <strong>{client.name}</strong>.
              </p>
              <p aria-live="polite" aria-atomic="true">
                {selectedCount} de {enabled.length} especialidades seleccionadas
                {dirty ? ' · Cambios sin guardar' : ' · Guardado'}
              </p>
              {!enabled.length ? (
                <p>
                  No hay especialidades activas. Crea o activa una en Catálogo de especialidades.
                </p>
              ) : (
                <>
                  <div
                    className="nf-actions"
                    role="group"
                    aria-label="Selección rápida de especialidades"
                  >
                    <Button
                      variant="secondary"
                      disabled={busy || selectedCount === enabled.length}
                      onClick={() => {
                        setSelected((current) => [
                          ...new Set([...current, ...enabled.map((item) => item.id)]),
                        ])
                        setMessage('')
                      }}
                    >
                      Seleccionar todas
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || selectedCount === 0}
                      onClick={() => {
                        setSelected((current) =>
                          current.filter((id) => !enabled.some((item) => item.id === id)),
                        )
                        setMessage('')
                      }}
                    >
                      Desmarcar todas
                    </Button>
                  </div>
                  <fieldset className="nf-specialty-options" disabled={busy}>
                    <legend>Especialidades disponibles</legend>
                    {enabled.map((item) => (
                      <label className="nf-check" key={item.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={(event) => {
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                            setMessage('')
                          }}
                        />
                        {item.name}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              {enabled.length > 0 && !enabled.some((item) => selected.includes(item.id)) && (
                <p role="status">
                  Sin especialidades habilitadas, los supervisores de este cliente no podrán
                  registrar nuevas incidencias.
                </p>
              )}
              {data.specialties.some((item) => !item.active && baseline.includes(item.id)) && (
                <p>
                  Hay especialidades asignadas que están inactivas en el catálogo. No estarán
                  disponibles para registrar incidencias hasta que se reactiven.
                </p>
              )}
              <div className="nf-actions nf-specialty-save">
                <Button disabled={!dirty || busy} onClick={() => void save()}>
                  {busy ? 'Guardando…' : 'Guardar cambios'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!dirty || busy}
                  onClick={() => change(() => chooseClient(clientId))}
                >
                  Descartar cambios
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <h2>Catálogo de especialidades</h2>
            <p>
              Estas especialidades se comparten entre todos los clientes. Crear una especialidad no
              la habilita automáticamente: después debes seleccionarla en Por cliente.
            </p>
            <Button onClick={() => setEditing('new')}>Nueva especialidad</Button>
          </Card>
          {!data.specialties.length && (
            <p>Aún no hay especialidades. Crea la primera para habilitarla a tus clientes.</p>
          )}
          <div className="nf-specialty-catalog">
            {data.specialties.map((item) => {
              const count = new Set(
                data.relations
                  .filter((row) => row.categoryId === item.id && row.active)
                  .map((row) => row.clientId),
              ).size
              return (
                <Card key={item.id}>
                  <h3>{item.name}</h3>
                  <Badge>{item.active ? 'Activa' : 'Inactiva'}</Badge>
                  <p>
                    {count} {count === 1 ? 'cliente con habilitación' : 'clientes con habilitación'}
                    {!item.active ? ' · No disponible para registrar incidencias' : ''}
                  </p>
                  <Button
                    variant="secondary"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    Editar
                  </Button>
                </Card>
              )
            })}
          </div>
        </>
      )}
      {editing && (
        <SpecialtyForm
          original={editing === 'new' ? undefined : editing}
          relations={data.relations}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setData((current) => ({
              ...current,
              specialties: [
                ...current.specialties.filter((item) => item.id !== saved.id),
                saved,
              ].sort((a, b) => a.id - b.id),
            }))
            setEditing(null)
            setMessage(
              `Especialidad «${saved.name}» guardada. ${saved.active ? 'Puedes habilitarla en Por cliente.' : 'Está inactiva para todos los clientes.'}`,
            )
          }}
        />
      )}
      {(pending || blocker.state === 'blocked') && (
        <Modal
          open
          title="Cambios sin guardar"
          busy={busy}
          onClose={() => {
            setPending(null)
            if (blocker.state === 'blocked') blocker.reset()
          }}
        >
          <p>
            Tienes cambios pendientes. Si continúas, se descartarán los cambios que no hayas
            guardado.
          </p>
          <div className="nf-actions">
            <Button
              disabled={busy}
              onClick={() => {
                setPending(null)
                if (blocker.state === 'blocked') blocker.reset()
              }}
            >
              Seguir editando
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (blocker.state === 'blocked') blocker.proceed()
                else pending?.()
                setPending(null)
              }}
            >
              Descartar y continuar
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

function SpecialtyForm({
  original,
  relations,
  onClose,
  onSaved,
}: {
  original?: Specialty
  relations: ClientSpecialty[]
  onClose: () => void
  onSaved: (saved: Specialty) => void
}) {
  const repos = useRepositories()
  const [name, setName] = useState(original?.name ?? '')
  const [active, setActive] = useState(original?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const count = new Set(
    relations
      .filter((row) => row.categoryId === original?.id && row.active)
      .map((row) => row.clientId),
  ).size
  return (
    <Modal
      open
      title={original ? 'Editar especialidad' : 'Nueva especialidad'}
      busy={busy}
      onClose={onClose}
    >
      <form
        className="nf-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          if (!name.trim()) {
            setError('Escribe el nombre de la especialidad.')
            return
          }
          setBusy(true)
          setError('')
          void repos.administration
            .save('specialties', { id: original?.id ?? 0, name: name.trim(), active })
            .then(onSaved)
            .catch((cause) => setError(errorMessage(cause)))
            .finally(() => setBusy(false))
        }}
      >
        <Input
          label="Nombre de especialidad"
          autoFocus
          required
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <label className="nf-check">
          <input
            type="checkbox"
            checked={active}
            disabled={busy}
            onChange={(event) => setActive(event.target.checked)}
          />
          Especialidad activa
        </label>
        {!active && (
          <p role="status">
            Esta especialidad no estará disponible para registrar nuevas incidencias en ningún
            cliente.{' '}
            {count > 0
              ? `Afectará a ${count} ${count === 1 ? 'cliente que la tiene habilitada' : 'clientes que la tienen habilitada'}.`
              : ''}{' '}
            Las incidencias existentes se conservan.
          </p>
        )}
        {!original && (
          <p>Después de crearla, habilítala para los clientes que la necesiten en Por cliente.</p>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="nf-actions">
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar especialidad'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
