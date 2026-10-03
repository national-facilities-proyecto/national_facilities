import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRepositories } from '../app/RepositoriesProvider'
import { useQuery } from '../hooks/useQuery'
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
import { QueryState } from '../components/feedback/QueryState'
import { QueryFeedback } from '../components/feedback/QueryFeedback'
import { LazyMap } from '../features/technician/LazyMap'
import { visitStatusLabels, type VisitStatus } from '../types/models'
import { errorMessage } from '../services/errors'

const sections: {
  id: 'available' | 'own' | 'review' | 'completed'
  label: string
  statuses: VisitStatus[]
}[] = [
  { id: 'available', label: 'Bolsa compartida', statuses: ['available'] },
  { id: 'own', label: 'Mis trabajos', statuses: ['claimed', 'in_progress'] },
  { id: 'review', label: 'En revisión', statuses: ['pending_approval'] },
  { id: 'completed', label: 'Finalizados', statuses: ['completed'] },
]

export default function ChecklistListPage() {
  const repos = useRepositories()
  const navigate = useNavigate()
  const [sectionId, setSectionId] = useState<(typeof sections)[number]['id']>('available')
  const query = useQuery(
    useCallback(
      async (signal) => {
        let generationError = ''
        try {
          await repos.checklists.generate?.()
        } catch (cause) {
          generationError = errorMessage(cause)
        }
        const [visits, stores] = await Promise.all([
          repos.checklists.list({ signal }),
          repos.stores.list({ signal }),
        ])
        return { visits, stores, generationError }
      },
      [repos],
    ),
  )
  if (!query.data || query.status !== 'success') return <QueryState query={query} />
  const { visits, stores } = query.data
  const section = sections.find((item) => item.id === sectionId)!
  return (
    <>
      <PageHeader
        title="Mis Checklist"
        description="Toma una visita de la bolsa compartida y registra el trabajo preventivo de este mes."
      />
      {query.data.generationError && (
        <Alert>
          La bolsa nueva no pudo generarse: {query.data.generationError} Puedes consultar y
          recuperar los registros existentes del servidor.
        </Alert>
      )}
      <QueryFeedback query={query} />
      <LazyMap
        stores={stores.filter((store) =>
          visits.some((visit) => visit.storeId === store.id && visit.status !== 'completed'),
        )}
        onSelect={(store) => {
          const visit = visits.find(
            (item) => item.storeId === store.id && item.status !== 'completed',
          )
          if (visit) void navigate(`/checklists/${visit.id}`)
        }}
      />
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
        {!visits.some((visit) => section.statuses.includes(visit.status)) && (
          <EmptyState>No hay visitas en esta sección.</EmptyState>
        )}
        {visits
          .filter((visit) => section.statuses.includes(visit.status))
          .map((visit) => {
            const store = stores.find((item) => item.id === visit.storeId)
            return (
              <Card key={visit.id}>
                <Badge>{visitStatusLabels[visit.status]}</Badge>
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
    </>
  )
}
