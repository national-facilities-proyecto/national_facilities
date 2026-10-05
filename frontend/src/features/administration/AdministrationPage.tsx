import { useCallback, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
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
  ResponsiveTable,
  Select,
} from '../../components/ui'
import type { AdminKind } from '../../types/models'
import { roleLabels } from '../../types/models'
import { titles, type Entity } from './fields'
import { AdminForm } from './AdminForm'

const isKind = (value: string | undefined): value is AdminKind =>
  value !== undefined && Object.hasOwn(titles, value)
export default function AdministrationPage() {
  const { kind } = useParams()
  return isKind(kind) ? (
    <AdminList key={kind} kind={kind} />
  ) : (
    <Alert>
      Recurso no encontrado. <Link to="/admin/users">Volver a usuarios</Link>
    </Alert>
  )
}
function AdminList({ kind }: { kind: AdminKind }) {
  const repos = useRepositories()
  const [editing, setEditing] = useState<Entity | 'new' | null>(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [userStatus, setUserStatus] = useState('')
  const query = useQuery(
    useCallback(
      async (signal) => {
        const [rows, stores, clients, templates, zones, specialties] = await Promise.all([
          repos.administration.list(kind, { signal }),
          repos.administration.list('stores', { signal }),
          repos.administration.list('clients', { signal }),
          repos.administration.list('templates', { signal }),
          repos.administration.list('zones', { signal }),
          repos.administration.list('specialties', { signal }),
        ])
        return { rows, stores, clients, templates, zones, specialties }
      },
      [kind, repos],
    ),
    editing === null,
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { rows, stores, clients, templates, zones, specialties } = query.data
  const filteredRows = rows.filter(
    (row) =>
      kind !== 'users' ||
      ('role' in row &&
        (!userName || row.name.toLocaleLowerCase().includes(userName.toLocaleLowerCase())) &&
        (!userRole || row.role === userRole) &&
        (!userStatus || String(row.active) === userStatus)),
  )
  return (
    <>
      <PageHeader
        title={titles[kind]}
        description="Administración de catálogos y configuración de la operación."
      />
      <QueryFeedback query={query} />
      <Button onClick={() => setEditing('new')}>Crear registro</Button>
      {(kind === 'specialties' || kind === 'clientSpecialties') && (
        <p>
          <Link to="/admin/specialties">Catálogo global</Link> ·{' '}
          <Link to="/admin/clientSpecialties">Habilitación por cliente</Link>
        </p>
      )}
      {kind === 'users' && (
        <Card>
          <div className="nf-filters">
            <Input
              label="Buscar por nombre"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
            />
            <Select
              label="Rol"
              value={userRole}
              onChange={(event) => setUserRole(event.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(roleLabels).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              label="Estado"
              value={userStatus}
              onChange={(event) => setUserStatus(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </Select>
          </div>
        </Card>
      )}
      <ResponsiveTable
        caption={titles[kind]}
        rows={filteredRows}
        rowKey={(row) => row.id}
        columns={[
          {
            label: 'Registro',
            render: (row) => (
              <strong>
                #{row.id} ·{' '}
                {'name' in row
                  ? row.name
                  : `${clients.find((client) => client.id === row.clientId)?.name ?? row.clientId}`}
              </strong>
            ),
          },
          {
            label: 'Detalle',
            render: (row) =>
              'role' in row
                ? `${row.email} · ${roleLabels[row.role]}`
                : 'address' in row
                  ? row.address
                  : 'monthlyVisits' in row
                    ? `${row.monthlyVisits} visitas / mes · Radio ${row.radiusMeters} m`
                    : 'tasks' in row
                      ? `Versión ${row.version} · ${row.tasks.length} ítems`
                      : 'taxId' in row
                        ? row.taxId
                        : 'categoryId' in row
                          ? (specialties.find((item) => item.id === row.categoryId)?.name ??
                            'Especialidad')
                          : 'clientId' in row
                            ? (clients.find((item) => item.id === row.clientId)?.name ?? 'Cliente')
                            : 'Catálogo global',
          },
          {
            label: 'Estado',
            render: (row) => (
              <Badge>{'active' in row ? (row.active ? 'Activo' : 'Inactivo') : 'Registrado'}</Badge>
            ),
          },
          {
            label: 'Acción',
            render: (row) => (
              <Button variant="secondary" onClick={() => setEditing(row)}>
                Editar
              </Button>
            ),
          },
        ]}
      />
      {editing && (
        <AdminForm
          kind={kind}
          original={editing === 'new' ? undefined : editing}
          stores={stores}
          clients={clients}
          templates={templates}
          zones={zones}
          specialties={specialties}
          onClose={() => {
            setEditing(null)
            query.reload()
          }}
        />
      )}
    </>
  )
}
