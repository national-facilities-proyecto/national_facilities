import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { QueryFeedback } from '../components/feedback/QueryFeedback'
import { Badge, Button, Card, Input, PageHeader, ResponsiveTable, Select } from '../components/ui'
import { displayDate, inDateRange } from '../utils/dates'
import { visitStatusLabels, visitWorkStatus, workStatusOptions } from '../types/models'

export default function TechnicalSupervisorChecklistsPage() {
  const repos = useRepositories()
  const [status, setStatus] = useState('')
  const [storeId, setStoreId] = useState('')
  const [priority, setPriority] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const query = useQuery(
    useCallback(
      async (signal) => {
        const [checklists, stores, users, tickets, catalogs] = await Promise.all([
          repos.checklists.list({ signal }),
          repos.stores.list({ signal }),
          repos.users.list({ signal }),
          repos.tickets.list({ signal }),
          repos.tickets.catalogs
            ? repos.tickets.catalogs()
            : Promise.reject(new Error('Catálogos no disponibles.')),
        ])
        return {
          visits: checklists,
          stores,
          users,
          tickets,
          catalogs,
        }
      },
      [repos],
    ),
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { visits, stores, users, tickets } = query.data
  const storeName = (id: number) => stores.find((store) => store.id === id)?.name ?? 'Tienda'
  const technician = (id?: number) => users.find((user) => user.id === id)?.name ?? 'Sin asignar'
  const visitPriority = (ticketId?: number) =>
    tickets.find((ticket) => ticket.id === ticketId)?.priority
  const filtered = visits.filter(
    (visit) =>
      (!status || visitWorkStatus(visit.status) === status) &&
      (!storeId || visit.storeId === Number(storeId)) &&
      (!priority || visitPriority(visit.ticketId) === priority) &&
      inDateRange(visit.startedAt ?? visit.scheduledAt, from, to),
  )
  return (
    <>
      <PageHeader
        title="Checklists"
        description="Supervisa el mantenimiento mensual. Las decisiones están en Revisiones pendientes."
      />
      <QueryFeedback query={query} />
      <Card>
        <div className="nf-filters">
          <Select label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {workStatusOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
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
            {query.data.catalogs.priorities.map(({ name: value }) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
          <Input
            label="Fecha de ejecución o programación desde"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            label="Fecha de ejecución o programación hasta"
            type="date"
            min={from}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setStatus('')
              setStoreId('')
              setPriority('')
              setFrom('')
              setTo('')
            }}
          >
            Limpiar filtros
          </Button>
        </div>
      </Card>
      <ResponsiveTable
        caption="Visitas y excepciones"
        rows={filtered}
        rowKey={(visit) => visit.id}
        columns={[
          {
            label: 'Visita',
            render: (visit) => (
              <>
                <strong>
                  #{visit.id} · {storeName(visit.storeId)}
                </strong>
                <p>
                  {visit.origin === 'checklist' ? 'Checklist mensual' : `Ticket #${visit.ticketId}`}
                </p>
              </>
            ),
          },
          {
            label: 'Técnico y fecha',
            render: (visit) => (
              <>
                {technician(visit.technicianId)}
                <p>
                  {visit.startedAt ? 'Ejecutada: ' : 'Programada: '}
                  {displayDate(visit.startedAt ?? visit.scheduledAt)}
                </p>
              </>
            ),
          },
          {
            label: 'Estado',
            render: (visit) => {
              const currentStatus = visitWorkStatus(visit.status)
              return (
                <Badge className={`nf-badge--${currentStatus}`}>
                  {visitStatusLabels[visit.status]}
                </Badge>
              )
            },
          },
          {
            label: 'Acción',
            render: (visit) => (
              <Link className="nf-link" to={`/technical-supervisor/checklists/${visit.id}`}>
                Ver detalle
              </Link>
            ),
          },
        ]}
      />
    </>
  )
}
