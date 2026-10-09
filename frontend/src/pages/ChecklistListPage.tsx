import { WorkRecovery } from '../features/checklists/WorkRecovery'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
import { QueryState } from '../components/feedback/QueryState'
import { QueryFeedback } from '../components/feedback/QueryFeedback'
import { LazyMap } from '../features/technician/LazyMap'
import { checklistMapLocations } from '../features/checklists/checklistMap'
import { operationalVisitLabel, type Visit } from '../types/models'
import { useAuth } from '../features/auth/AuthProvider'

const sections: {
  id: 'available' | 'review' | 'completed'
  label: string
}[] = [
  { id: 'available', label: 'Bolsa compartida' },
  { id: 'review', label: 'En revisión' },
  { id: 'completed', label: 'Finalizados' },
]

export default function ChecklistListPage() {
  const repos = useRepositories()
  const { session } = useAuth()
  const [sectionId, setSectionId] = useState<(typeof sections)[number]['id']>('available')
  const query = useQuery(
    useCallback(
      async (signal) => {
        let generationError = false
        try {
          await repos.checklists.generate?.()
        } catch {
          generationError = true
        }
        const visits = await repos.checklists.list({ signal })
        return { visits, generationError }
      },
      [repos],
    ),
  )
  const storeQuery = useQuery(useCallback((signal) => repos.stores.list({ signal }), [repos]))
  const mapStores = useMemo(() => checklistMapLocations(storeQuery.data ?? []), [storeQuery.data])
  const visits = query.data?.visits ?? []
  const stores = storeQuery.data ?? []
  const section = sections.find((item) => item.id === sectionId)!
  const inSection = (visit: Visit) => {
    if (visit.origin !== 'checklist') return false
    if (section.id === 'available') return visit.status === 'available'
    if (visit.technicianId !== session?.user.id) return false
    return section.id === 'review'
      ? visit.status === 'pending_approval' &&
          visit.phase === 'in_review' &&
          Boolean(visit.submittedAt)
      : visit.status === 'completed'
  }
  return (
    <>
      <PageHeader
        title="Mis Checklist"
        description="Toma una visita de la bolsa compartida y registra el trabajo preventivo de este mes."
      />
      {query.data?.generationError && (
        <Alert>
          No pudimos actualizar la bolsa. Puedes consultar tus registros existentes e intentar de
          nuevo.
        </Alert>
      )}
      <WorkRecovery />
      {storeQuery.status !== 'success' ? (
        <QueryState query={storeQuery} showHeading={false} />
      ) : mapStores.length ? (
        <LazyMap stores={mapStores} />
      ) : (
        <section className="nf-card" aria-label="Mapa de tiendas">
          <h2>Ubicaciones asignadas</h2>
          <EmptyState>
            {stores.some((store) => store.active)
              ? 'Tus tiendas asignadas aún no tienen una ubicación disponible.'
              : 'No tienes tiendas asignadas por ahora.'}
          </EmptyState>
        </section>
      )}
      <QueryFeedback query={storeQuery} />
      <QueryFeedback query={query} />
      {query.status !== 'success' ? (
        <QueryState query={query} showHeading={false} />
      ) : (
        <section className="nf-list" aria-label="Visitas de checklist">
          <div className="nf-segmented" role="group" aria-label="Estado de visitas">
            {sections.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                aria-pressed={sectionId === item.id}
                onClick={() => setSectionId(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <h2>{section.label}</h2>
          {!visits.some(inSection) && (
            <EmptyState>
              {section.id === 'available'
                ? 'No tienes checklists disponibles por ahora.'
                : section.id === 'review'
                  ? 'No tienes checklists en revisión.'
                  : 'No tienes checklists finalizados.'}
            </EmptyState>
          )}
          {visits.filter(inSection).map((visit) => {
            const store = stores.find((item) => item.id === visit.storeId)
            return (
              <Card key={visit.id}>
                <Badge>{operationalVisitLabel(visit)}</Badge>
                <h3>{store?.name}</h3>
                {visit.quota && (
                  <p>
                    Visita mensual {visit.quota}
                    {visit.quotaCount ? ` de ${visit.quotaCount}` : ''}
                  </p>
                )}
                <p>{store?.address}</p>
                <p>Contacto: {store?.contact}</p>
                <Link className="nf-link" to={`/checklists/${visit.id}`}>
                  Ver detalle
                </Link>
              </Card>
            )
          })}
        </section>
      )}
    </>
  )
}
