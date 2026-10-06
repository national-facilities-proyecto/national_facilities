import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Store, Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { Alert, Button, Card } from '../../components/ui'
import { errorMessage } from '../../services/errors'
import { displayDate } from '../../utils/dates'
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
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState(visit)
  const [claimed, setClaimed] = useState(!claimBeforeStart)
  const reserve = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setCurrent(await checklists.claim(visit.id))
      setClaimed(true)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title={claimed ? 'Registrar llegada' : 'Tomar checklist'}>
      <p>{store.name}</p>
      <p>
        {claimed
          ? 'Pendiente de iniciar. Registrar llegada solicita una lectura GPS fresca y comienza el trabajo físico.'
          : 'Reserva el checklist antes de registrar llegada.'}
      </p>
      <p>
        Radio publicado:{' '}
        {current.radiusMeters === undefined ? 'No registrado' : `${current.radiusMeters} m`}.
      </p>
      <p>
        El trabajo físico no tiene plazo de cinco minutos. El formulario se abre después de terminar
        el recorrido o atención.
      </p>
      {current.claimExpiresAt && <p>Reserva hasta {displayDate(current.claimExpiresAt)}.</p>}
      {error && <Alert>{error}</Alert>}
      {claimed ? (
        <GpsAction
          visit={current}
          scope="arrival"
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
      ) : (
        <Button disabled={busy} onClick={() => void reserve()}>
          Tomar checklist
        </Button>
      )}
    </Card>
  )
}
