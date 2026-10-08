import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Store, Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { Card } from '../../components/ui'
import { GpsAction } from './GpsAction'

export function VisitStart({
  visit,
  store,
  claimBeforeStart = false,
  onStarted,
}: {
  visit: Visit
  store: Store
  claimBeforeStart?: boolean
  onStarted?: () => void
}) {
  const { checklists } = useRepositories()
  const navigate = useNavigate()
  const [current, setCurrent] = useState(visit)
  const [claimed, setClaimed] = useState(!claimBeforeStart)
  const prepare = async () => {
    if (claimed) return current
    const next = await checklists.claim(visit.id)
    setCurrent(next)
    setClaimed(true)
    return next
  }
  return (
    <Card title="Iniciar trabajo">
      <p className="nf-muted">
        Confirma tu llegada a {store.name} con la ubicación del dispositivo.
      </p>
      <GpsAction
        visit={current}
        scope="arrival"
        beforeStart={prepare}
        onConfirmed={() => {
          if (onStarted) onStarted()
          else
            void navigate(
              visit.origin === 'checklist'
                ? `/checklists/${visit.id}/start`
                : `/routes/${visit.id}`,
            )
        }}
      />
    </Card>
  )
}
