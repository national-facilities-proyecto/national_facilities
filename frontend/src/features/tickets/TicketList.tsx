import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  ResponsiveTable,
  Select,
} from '../../components/ui'
import { displayDate, inDateRange } from '../../utils/dates'
import { ticketStatusLabels, type TicketStatus } from '../../types/models'

type StoreSupervisorStatus = 'open' | 'scheduled' | 'pending_approval' | 'completed'

function storeSupervisorStatus(ticket: { status: TicketStatus }): StoreSupervisorStatus {
  if (ticket.status === 'open') return 'open'
  if (ticket.status === 'pending_approval') return 'pending_approval'
  if (['resolved', 'closed'].includes(ticket.status)) return 'completed'
  return 'scheduled'
}

const storeSupervisorStatusLabels: Record<StoreSupervisorStatus, string> = {
  open: 'Abierto',
  scheduled: 'Programado',
  pending_approval: 'Por aprobar',
  completed: 'Completado',
}

export function TicketList({
  account = false,
  pending = false,
}: {
  account?: boolean
  pending?: boolean
}) {
  const repos = useRepositories()
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [storeId, setStoreId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const isStoreSupervisorView = !account && !pending
  const usesSimplifiedStatuses = !pending
  const query = useQuery(
    useCallback(
      async (signal) => {
        const [tickets, stores, users] = await Promise.all([
          repos.tickets.list({ signal }),
          repos.stores.list({ signal }),
          repos.users.list({ signal }),
        ])
        return { tickets, stores, users }
      },
      [repos],
    ),
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { stores, users } = query.data
  const storeName = (id: number) => stores.find((store) => store.id === id)?.name ?? 'Tienda'
  const rows = query.data.tickets.filter(
    (ticket) =>
      (!pending || ticket.status === 'open') &&
      (pending ||
        !status ||
        (usesSimplifiedStatuses
          ? storeSupervisorStatus(ticket) === status
          : ticket.status === status)) &&
      (isStoreSupervisorView || !priority || ticket.priority === priority) &&
      (!category || ticket.category === category) &&
      (!storeId || ticket.storeId === Number(storeId)) &&
      (pending || inDateRange(ticket.createdAt, from, to)),
  )
  return (
    <>
      <PageHeader
        title={pending ? 'Programación de visitas' : account ? 'Incidencias' : 'Mis incidencias'}
        description={
          pending
            ? 'Revisa los reportes de las tiendas y asigna una atención técnica.'
            : 'Consulta la asignación, programación y resolución de cada reporte.'
        }
      />
      <Card>
        <div className="nf-filters">
          {!pending && (
            <Select label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              {(usesSimplifiedStatuses
                ? (Object.keys(storeSupervisorStatusLabels) as StoreSupervisorStatus[])
                : (Object.keys(ticketStatusLabels) as TicketStatus[])
              ).map((value) => (
                <option key={value} value={value}>
                  {usesSimplifiedStatuses
                    ? storeSupervisorStatusLabels[value as StoreSupervisorStatus]
                    : ticketStatusLabels[value as TicketStatus]}
                </option>
              ))}
            </Select>
          )}
          <Select
            label="Especialidad"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Todas</option>
            {['Climatización', 'Eléctrico', 'Plomería', 'Refrigeración'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
          {isStoreSupervisorView && (
            <>
              <Input
                label="Fecha inicio"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
              <Input
                label="Fecha fin"
                type="date"
                min={from}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setStatus('')
                  setCategory('')
                  setFrom('')
                  setTo('')
                }}
              >
                Limpiar filtros
              </Button>
            </>
          )}
          {pending && (
            <>
              <Select label="Tienda" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                <option value="">Todas</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Prioridad"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="">Todas</option>
                {['Alta', 'Media', 'Baja'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
              <Button
                variant="secondary"
                onClick={() => {
                  setStoreId('')
                  setCategory('')
                  setPriority('')
                }}
              >
                Limpiar filtros
              </Button>
            </>
          )}
          {!isStoreSupervisorView && !pending && (
            <>
              <Select label="Tienda" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                <option value="">Todas</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Prioridad"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="">Todas</option>
                {['Alta', 'Media', 'Baja'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
              <Input
                label="Fecha inicio"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
              <Input
                label="Fecha fin"
                type="date"
                min={from}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  setStatus('')
                  setPriority('')
                  setCategory('')
                  setStoreId('')
                  setFrom('')
                  setTo('')
                }}
              >
                Limpiar filtros
              </Button>
            </>
          )}
        </div>
      </Card>
      <p role="status">{rows.length} incidencias</p>
      <ResponsiveTable
        caption="Seguimiento de incidencias"
        rows={rows}
        rowKey={(ticket) => ticket.id}
        columns={[
          {
            label: 'Incidencia',
            render: (ticket) => (
              <>
                <strong>
                  #{ticket.id} · {storeName(ticket.storeId)}
                </strong>
                <p>{ticket.description}</p>
              </>
            ),
          },
          {
            label: 'Programación',
            render: (ticket) => (
              <>
                {displayDate(ticket.scheduledAt)}
                <p>
                  {users.find((user) => user.id === ticket.technicianId)?.name ??
                    (ticket.technicianId ? `Técnico #${ticket.technicianId}` : 'Sin asignar')}
                </p>
              </>
            ),
          },
          {
            label: 'Estado y prioridad',
            render: (ticket) => (
              <>
                <Badge
                  className={
                    usesSimplifiedStatuses
                      ? `nf-badge--${storeSupervisorStatus(ticket)}`
                      : undefined
                  }
                >
                  {usesSimplifiedStatuses
                    ? storeSupervisorStatusLabels[storeSupervisorStatus(ticket)]
                    : ticketStatusLabels[ticket.status]}
                </Badge>
                <p>{ticket.priority}</p>
              </>
            ),
          },
          {
            label: 'Acción',
            render: (ticket) => (
              <Link
                className="nf-link"
                to={
                  account
                    ? `/technical-supervisor/incidents/${ticket.id}`
                    : `/supervisor/tickets/${ticket.id}`
                }
              >
                Ver detalle
              </Link>
            ),
          },
        ]}
      />
    </>
  )
}
