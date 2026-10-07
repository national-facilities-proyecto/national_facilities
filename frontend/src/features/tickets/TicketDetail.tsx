import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
import { QueryFeedback } from '../../components/feedback/QueryFeedback'
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '../../components/ui'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { displayDate, localDate, localDateTime } from '../../utils/dates'
import {
  ticketStatusLabels,
  ticketWorkStatus,
  type Priority,
  type Ticket,
  type User,
  type Visit,
} from '../../types/models'
import { AppError, errorMessage } from '../../services/errors'
import { NotPerformedAction } from '../checklists/NotPerformedAction'
export function TicketDetail({ id, account = false }: { id: number; account?: boolean }) {
  const repos = useRepositories()
  const [notPerformed, setNotPerformed] = useState<Visit>()
  const query = useQuery(
    useCallback(
      async (signal) => {
        const ticket = await repos.tickets.get(id, { signal })
        if (!repos.tickets.catalogs) throw new Error('Falta catálogo de tickets.')
        const [store, users, catalogs, eligible] = await Promise.all([
          repos.stores.get(ticket.storeId, { signal }),
          repos.users.list({ signal }),
          repos.tickets.catalogs(),
          account && repos.users.eligible
            ? repos.users.eligible(ticket.storeId, { signal })
            : Promise.resolve(undefined),
        ])
        const eligibleUsers =
          eligible ??
          users.filter(
            (user) =>
              user.active &&
              user.role === 'technician' &&
              store.zoneId != null &&
              user.coverages?.some(
                (row) => row.clientId === store.clientId && row.zoneId === store.zoneId,
              ),
          )
        const visit =
          account && ticket.visitId ? await repos.visits.get(ticket.visitId, { signal }) : undefined
        return { ticket, store, users, catalogs, eligibleUsers, visit }
      },
      [id, repos, account],
    ),
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { ticket, store, users, catalogs, eligibleUsers } = query.data
  const person = (userId?: number) =>
    users.find((user) => user.id === userId)?.name ??
    (userId ? `Usuario #${userId}` : 'Sin asignar')
  return (
    <>
      <Link
        className="nf-link"
        to={account ? '/technical-supervisor/incidents/completed' : '/supervisor/tickets'}
      >
        ← Incidencias
      </Link>
      <PageHeader title={`Ticket #${ticket.id}`} description={`${store.name} · ${store.address}`} />
      <QueryFeedback query={query} />
      <div className="nf-two-columns">
        <Card title="Reporte original">
          <Badge>{ticketStatusLabels[ticket.status]}</Badge>
          <p>
            {ticket.category} · Prioridad {ticket.priority}
          </p>
          <p>{ticket.description}</p>
          <p>
            Reportado por {person(ticket.reporterId)} · {displayDate(ticket.createdAt)}
          </p>
          <EvidenceGallery ids={ticket.evidenceIds} />
        </Card>
        <Card title="Programación">
          <p>Técnico: {person(ticket.technicianId)}</p>
          <p>Visita: {displayDate(ticket.scheduledAt)}</p>
          {query.data.visit && (
            <NotPerformedAction
              visit={query.data.visit}
              onConfirmed={(next) => {
                setNotPerformed(next)
                query.reload()
              }}
            />
          )}
          {account && ticketWorkStatus(ticket.status) === 'pending' && (
            <ScheduleForm
              key={ticket.history.length}
              ticket={ticket}
              users={eligibleUsers}
              priorities={catalogs.priorities}
            />
          )}
          {account && ticketWorkStatus(ticket.status) !== 'pending' && (
            <p>Solo se puede cambiar de técnico mientras el ticket esté Pendiente.</p>
          )}
        </Card>
      </div>
      {notPerformed?.phase === 'not_performed' && (
        <Card title="No realizado">
          <p>
            No realizado no cuenta como trabajo completado. Consulta la programación actual de la
            incidencia.
          </p>
        </Card>
      )}
      <Card title="Historial">
        <ol className="nf-timeline">
          {ticket.history.map((event) => (
            <li key={event.id}>
              <strong>{event.text}</strong>
              <p>
                {displayDate(event.at)} · {person(event.actorId)}
              </p>
              {event.reason && <p>Motivo: {event.reason}</p>}
              {event.previous && (
                <p>
                  Antes: {person(event.previous.technicianId)} ·{' '}
                  {displayDate(event.previous.scheduledAt)} · Prioridad{' '}
                  {catalogs.priorities.find((item) => item.id === event.previous?.priorityId)
                    ?.name ?? 'No registrada'}
                </p>
              )}
              {event.next && (
                <p>
                  Después: {person(event.next.technicianId)} · {displayDate(event.next.scheduledAt)}{' '}
                  · Prioridad{' '}
                  {catalogs.priorities.find((item) => item.id === event.next?.priorityId)?.name ??
                    'No registrada'}
                </p>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Resolución del técnico">
        {ticket.resolution ? (
          <>
            <p>{ticket.resolution}</p>
            <p>
              {ticket.resolvedAt
                ? `Finalizado: ${displayDate(ticket.resolvedAt)}`
                : 'Registro técnico guardado; finalización pendiente.'}
            </p>
            <EvidenceGallery ids={ticket.technicalEvidenceIds} />
          </>
        ) : (
          <p>La resolución estará disponible cuando el técnico registre el trabajo.</p>
        )}
      </Card>
    </>
  )
}
function ScheduleForm({
  ticket,
  users,
  priorities,
}: {
  ticket: Ticket
  users: User[]
  priorities: { id: number; name: string }[]
}) {
  const { tickets } = useRepositories()
  const [technician, setTechnician] = useState(ticket.technicianId ?? 0)
  const [date, setDate] = useState(
    ticket.scheduledAt ? localDateTime(ticket.scheduledAt) : `${localDate()}T10:00`,
  )
  const [priority, setPriority] = useState<Priority>(ticket.priority)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  return (
    <form
      className="nf-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        setFieldErrors({})
        void tickets
          .schedule(ticket.id, technician, date, priority, reason, ticket.revision)
          .catch((cause) => {
            setError(errorMessage(cause))
            setFieldErrors(cause instanceof AppError ? cause.fields : {})
          })
          .finally(() => setBusy(false))
      }}
    >
      <Select
        label="Técnico asignado"
        errors={fieldErrors.technicianId}
        required
        value={technician}
        onChange={(event) => setTechnician(Number(event.target.value))}
      >
        <option value={0}>Seleccionar técnico</option>
        {users
          .filter((user) => user.active && user.role === 'technician')
          .map((user) => (
            <option value={user.id} key={user.id}>
              {user.name}
            </option>
          ))}
      </Select>
      <Input
        label="Fecha y hora de visita"
        errors={fieldErrors.scheduledAt}
        type="datetime-local"
        min={`${localDate()}T00:00`}
        required
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <p>
        La fecha se introduce en la zona horaria del dispositivo. El historial muestra la hora de
        operación de Perú.
      </p>
      <Select
        label="Prioridad asignada"
        errors={fieldErrors.priorityId}
        value={priority}
        onChange={(event) => setPriority(event.target.value)}
      >
        {priorities.map((item) => (
          <option key={item.id} value={item.name}>
            {item.name}
          </option>
        ))}
      </Select>
      {ticket.technicianId && (
        <Textarea
          label="Motivo de reprogramación o reasignación"
          errors={fieldErrors.reason}
          required
          minLength={10}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      )}
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={busy || !technician}>
        {busy ? 'Guardando…' : ticket.technicianId ? 'Guardar reprogramación' : 'Programar visita'}
      </Button>
    </form>
  )
}
