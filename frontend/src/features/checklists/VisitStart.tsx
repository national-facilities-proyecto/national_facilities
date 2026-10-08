import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Store, Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { Button, Card } from '../../components/ui'
import { operationDate, scheduleDate } from '../../utils/dates'
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
  const [initialClock] = useState(() => new Date())
  const future =
    visit.origin === 'ticket' &&
    operationDate(new Date(visit.scheduledAt)) >
      operationDate(visit.serverNow ? new Date(visit.serverNow) : initialClock)
  const prepare = async () => {
    if (claimed) return current
    const next = await checklists.claim(visit.id)
    setCurrent(next)
    setClaimed(true)
    return next
  }
  return (
    <Card title="Iniciar trabajo">
      {future ? (
        <>
          <p>
            La atención está programada para el {scheduleDate(visit.scheduledAt)}. Puedes registrar
            llegada desde ese día.
          </p>
          <p>Si necesitas atender antes, solicita la reprogramación al supervisor.</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Actualizar programación
          </Button>
        </>
      ) : (
        <>
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
        </>
      )}
    </Card>
  )
}
