import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { QueryState } from '../components/feedback/QueryState'
import { Badge, Button, Card, Input, PageHeader, ResponsiveTable, Select } from '../components/ui'
import { displayDate, inDateRange } from '../utils/dates'
import { type VisitStatus } from '../types/models'

type ChecklistStatus = 'open' | 'scheduled' | 'pending_approval' | 'completed'

const checklistStatusLabels: Record<ChecklistStatus, string> = {
  open: 'Abierto',
  scheduled: 'Programado',
  pending_approval: 'Por aprobar',
  completed: 'Completado',
}

function checklistStatus(status: VisitStatus): ChecklistStatus {
  if (status === 'available') return 'open'
  if (status === 'pending_approval') return 'pending_approval'
  if (status === 'completed') return 'completed'
  return 'scheduled'
}

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
        const [checklists, visits, stores, users, tickets] = await Promise.all([
          repos.checklists.list({ signal }),
          repos.visits.list({ signal }),
          repos.stores.list({ signal }),
          repos.users.list({ signal }),
          repos.tickets.list({ signal }),
        ])
        return {
          visits: [...checklists, ...visits.filter((visit) => visit.status === 'pending_approval')],
          stores,
          users,
          tickets,
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
      (!status || checklistStatus(visit.status) === status) &&
      (!storeId || visit.storeId === Number(storeId)) &&
      (!priority || visitPriority(visit.ticketId) === priority) &&
      inDateRange(visit.completedAt ?? visit.scheduledAt, from, to),
  )
  return (
    <>
      <PageHeader
        title="Checklists y excepciones GPS"
        description="Supervisa el mantenimiento mensual y revisa excepciones de checklists y tickets."
      />
      <Card>
        <div className="nf-filters">
          <Select label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {(Object.keys(checklistStatusLabels) as ChecklistStatus[]).map((value) => (
              <option key={value} value={value}>
                {checklistStatusLabels[value]}
              </option>
            ))}
          </Select>
          <Select label="Tienda" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            <option value="">Todas</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
          <Select label="Prioridad" value={priority} onChange={(event) => setPriority(event.target.value)}>
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
                <p>{displayDate(visit.completedAt ?? visit.scheduledAt)}</p>
              </>
            ),
          },
          {
            label: 'Estado',
            render: (visit) => {
              const currentStatus = checklistStatus(visit.status)
              return (
                <Badge className={`nf-badge--${currentStatus}`}>
                  {checklistStatusLabels[currentStatus]}
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
