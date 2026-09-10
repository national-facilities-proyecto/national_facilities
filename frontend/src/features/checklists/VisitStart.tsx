import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Store, Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useLocationRequest } from '../geolocation/useLocation'
import { Alert, Button, Card } from '../../components/ui'
import { errorMessage } from '../../services/errors'
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
  const { checklists, visits } = useRepositories()
  const location = useLocationRequest(store)
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [claimed, setClaimed] = useState(!claimBeforeStart)
  return (
    <Card title={visit.origin === 'checklist' ? 'Iniciar checklist' : 'Iniciar visita'}>
      <p>
        {claimed ? 'Confirma tu ubicación para iniciar.' : 'Al iniciar, la visita quedará asignada a ti.'}{' '}
        Radio permitido: {visit.radiusMeters} m.
      </p>
      {error && <Alert>{error}</Alert>}
      <Button
        disabled={busy}
        onClick={() => {
          if (busy) return
          setBusy(true)
          setError('')
          void location
            .request()
            .then((coordinates) =>
              (claimed
                ? Promise.resolve()
                : checklists.claim(visit.id).then(() => setClaimed(true))
              ).then(() => visits.start(visit.id, coordinates)),
            )
            .then(() => {
              if (onStarted) onStarted()
              else void navigate(`/checklists/${visit.id}/start`)
            })
            .catch((cause) => setError(errorMessage(cause)))
            .finally(() => setBusy(false))
        }}
      >
        {busy
          ? 'Solicitando ubicación…'
          : visit.origin === 'checklist'
            ? 'Iniciar checklist'
            : 'Iniciar atención'}
      </Button>
    </Card>
  )
}
