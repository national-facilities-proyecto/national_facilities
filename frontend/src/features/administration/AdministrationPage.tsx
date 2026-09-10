import { useCallback, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useQuery } from '../../hooks/useQuery'
import { QueryState } from '../../components/feedback/QueryState'
import { Alert, Badge, Button, Card, Input, PageHeader, ResponsiveTable, Select } from '../../components/ui'
import type { AdminEntities, AdminKind, UserRole } from '../../types/models'
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
        const [rows, stores, clients, templates] = await Promise.all([
          repos.administration.list(kind, { signal }),
          repos.administration.list('stores', { signal }),
          repos.administration.list('clients', { signal }),
          repos.administration.list('templates', { signal }),
        ])
        return { rows, stores, clients, templates }
      },
      [kind, repos],
    ),
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { rows, stores, clients, templates } = query.data
  const filteredRows =
    kind === 'users'
      ? (rows as AdminEntities['users'][]).filter(
          (user) =>
            (!userName || user.name.toLocaleLowerCase().includes(userName.toLocaleLowerCase())) &&
            (!userRole || user.role === userRole) &&
            (!userStatus || String(user.active) === userStatus),
        )
      : rows
  return (
    <>
      <PageHeader
        title={titles[kind]}
        description="Administración de catálogos y configuración de la operación."
      />
      <Button onClick={() => setEditing('new')}>Crear registro</Button>
      {kind === 'users' && (
        <Card>
          <div className="nf-filters">
            <Input
              label="Buscar por nombre"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
            />
            <Select label="Rol" value={userRole} onChange={(event) => setUserRole(event.target.value)}>
              <option value="">Todos</option>
              {(Object.keys(roleLabels) as UserRole[]).map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
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
                  : `Contrato de ${clients.find((client) => client.id === row.clientId)?.name ?? row.clientId}`}
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
                      : row.taxId,
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
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
