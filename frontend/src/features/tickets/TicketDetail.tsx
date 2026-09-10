import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
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
import { displayDate, localDate } from '../../utils/dates'
import { ticketStatusLabels, type Priority, type Ticket, type User } from '../../types/models'
import { errorMessage } from '../../services/errors'
export function TicketDetail({ id, account = false }: { id: number; account?: boolean }) {
  const repos = useRepositories()
  const query = useQuery(
    useCallback(
      async (signal) => {
        const ticket = await repos.tickets.get(id, { signal })
        const [store, users] = await Promise.all([
          repos.stores.get(ticket.storeId, { signal }),
          repos.users.list({ signal }),
        ])
        return { ticket, store, users }
      },
      [id, repos],
    ),
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { ticket, store, users } = query.data
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
          {account && ['open', 'scheduled'].includes(ticket.status) && (
            <ScheduleForm key={ticket.history.length} ticket={ticket} users={users} />
          )}
        </Card>
      </div>
      <Card title="Historial">
        <ol className="nf-timeline">
          {ticket.history.map((event) => (
            <li key={event.id}>
              <strong>{event.text}</strong>
              <p>
                {displayDate(event.at)} · {person(event.actorId)}
              </p>
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
                ? `Resuelto: ${displayDate(ticket.resolvedAt)}`
                : 'Pendiente de revisión GPS.'}
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
function ScheduleForm({ ticket, users }: { ticket: Ticket; users: User[] }) {
  const { tickets } = useRepositories()
  const [technician, setTechnician] = useState(ticket.technicianId ?? 0)
  const [date, setDate] = useState(ticket.scheduledAt?.slice(0, 16) ?? `${localDate()}T10:00`)
  const [priority, setPriority] = useState<Priority>(ticket.priority)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form
      className="nf-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        void tickets
          .schedule(ticket.id, technician, date, priority, reason)
          .catch((cause) => setError(errorMessage(cause)))
          .finally(() => setBusy(false))
      }}
    >
      <Select
        label="Técnico asignado"
        required
        value={technician}
        onChange={(event) => setTechnician(Number(event.target.value))}
      >
        <option value={0}>Seleccionar técnico</option>
        {users
          .filter(
            (user) =>
              user.active && user.role === 'technician' && user.storeIds.includes(ticket.storeId),
          )
          .map((user) => (
            <option value={user.id} key={user.id}>
              {user.name}
            </option>
          ))}
      </Select>
      <Input
        label="Fecha y hora de visita"
        type="datetime-local"
        min={`${localDate()}T00:00`}
        required
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <Select
        label="Prioridad asignada"
        value={priority}
        onChange={(event) => setPriority(event.target.value as Priority)}
      >
        <option>Alta</option>
        <option>Media</option>
        <option>Baja</option>
      </Select>
      {ticket.technicianId && (
        <Textarea
          label="Motivo de reprogramación o reasignación"
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
