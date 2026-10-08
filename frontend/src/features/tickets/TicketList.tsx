import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
import { QueryFeedback } from '../../components/feedback/QueryFeedback'
import { Badge, Input, PageHeader, ResponsiveTable, Select } from '../../components/ui'
import { scheduleDate, inDateRange } from '../../utils/dates'
import { ListFilters } from '../../components/ListFilters'
import { ticketStatusLabels, ticketWorkStatus, workStatusOptions } from '../../types/models'

export function TicketList({
  account = false,
  pending = false,
}: {
  account?: boolean
  pending?: boolean
}) {
  const repos = useRepositories()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [storeId, setStoreId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const isStoreSupervisorView = !account && !pending
  const query = useQuery(
    useCallback(
      async (signal) => {
        const [tickets, stores, users, catalogs] = await Promise.all([
          repos.tickets.list({ signal }),
          repos.stores.list({ signal }),
          repos.users.list({ signal }),
          repos.tickets.catalogs
            ? repos.tickets.catalogs()
            : Promise.reject(new Error('Catálogos no disponibles.')),
        ])
        return { tickets, stores, users, catalogs }
      },
      [repos],
    ),
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { stores, users } = query.data
  const storeName = (id: number) => stores.find((store) => store.id === id)?.name ?? 'Tienda'
  const rows = query.data.tickets.filter(
    (ticket) =>
      (!search ||
        `${storeName(ticket.storeId)} ${ticket.description} ${ticket.id}`
          .toLocaleLowerCase('es-PE')
          .includes(search.toLocaleLowerCase('es-PE'))) &&
      (!pending || ticket.status === 'open') &&
      (pending || !status || ticketWorkStatus(ticket.status) === status) &&
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
      <QueryFeedback query={query} />
      <ListFilters
        search={
          <Input
            label="Buscar incidencias"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
        active={[
          search && `Búsqueda: ${search}`,
          status && workStatusOptions.find((item) => item.value === status)?.label,
          category,
          priority,
          storeId && storeName(Number(storeId)),
          from && `Desde ${scheduleDate(from)}`,
          to && `Hasta ${scheduleDate(to)}`,
        ].filter((value): value is string => Boolean(value))}
        onClear={() => {
          setSearch('')
          setStatus('')
          setCategory('')
          setPriority('')
          setStoreId('')
          setFrom('')
          setTo('')
        }}
      >
        {!pending && (
          <Select label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {workStatusOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
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
          {query.data.catalogs.categories.map(({ name }) => (
            <option key={name}>{name}</option>
          ))}
        </Select>
        {!isStoreSupervisorView && (
          <>
            <Select
              label="Tienda"
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
            >
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
              {query.data.catalogs.priorities.map(({ name }) => (
                <option key={name}>{name}</option>
              ))}
            </Select>
          </>
        )}
        {!pending && (
          <>
            <Input
              label="Fecha inicio"
              type="date"
              lang="es-PE"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <Input
              label="Fecha fin"
              type="date"
              lang="es-PE"
              min={from}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </>
        )}
      </ListFilters>
      <p role="status">{rows.length} incidencias</p>
      <ResponsiveTable
        caption="Seguimiento de incidencias"
        rows={rows}
        rowKey={(ticket) => ticket.id}
        mobileRow={(ticket) => (
          <div className="nf-ticket-card">
            <h2>{storeName(ticket.storeId)}</h2>
            <p className="nf-ticket-description">{ticket.description}</p>
            <div className="nf-ticket-meta">
              <Badge className={`nf-badge--${ticketWorkStatus(ticket.status)}`}>
                {ticketStatusLabels[ticket.status]}
              </Badge>
              <Badge>Prioridad {ticket.priority}</Badge>
            </div>
            {ticket.technicianId && (
              <p>
                Técnico: {users.find((user) => user.id === ticket.technicianId)?.name ?? 'Asignado'}
              </p>
            )}
            {ticket.scheduledAt && <p>Programada: {scheduleDate(ticket.scheduledAt)}</p>}
            <footer>
              <small>Incidencia #{ticket.id}</small>
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
            </footer>
          </div>
        )}
        columns={[
          {
            label: 'Incidencia',
            render: (ticket) => (
              <>
                <strong>{storeName(ticket.storeId)}</strong>
                <p className="nf-ticket-description">{ticket.description}</p>
                <small>Incidencia #{ticket.id}</small>
              </>
            ),
          },
          {
            label: 'Programación',
            render: (ticket) => (
              <>
                {scheduleDate(ticket.scheduledAt)}
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
                <Badge className={`nf-badge--${ticketWorkStatus(ticket.status)}`}>
                  {ticketStatusLabels[ticket.status]}
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
