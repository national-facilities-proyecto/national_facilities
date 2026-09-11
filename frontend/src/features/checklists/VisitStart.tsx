import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Coordinates, Store, Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useLocationRequest } from '../geolocation/useLocation'
import { distanceMeters } from '../geolocation/location'
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
  const { checklists, visits, source } = useRepositories()
  const location = useLocationRequest(store)
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [claimed, setClaimed] = useState(!claimBeforeStart)
  const [coordinates, setCoordinates] = useState<Coordinates>()
  const distance = coordinates ? Math.round(distanceMeters(coordinates, store)) : null
  const request = () => {
    setBusy(true)
    setError('')
    void location
      .request()
      .then(setCoordinates)
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false))
  }
  const confirm = () => {
    if (!coordinates || busy) return
    setBusy(true)
    setError('')
    void (claimed ? Promise.resolve() : checklists.claim(visit.id).then(() => setClaimed(true)))
      .then(() => visits.start(visit.id, coordinates))
      .then(() =>
        onStarted
          ? onStarted()
          : navigate(
              visit.origin === 'checklist'
                ? `/checklists/${visit.id}/start`
                : `/routes/${visit.id}`,
            ),
      )
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false))
  }
  return (
    <Card title={visit.origin === 'checklist' ? 'Iniciar checklist' : 'Iniciar atención'}>
      <p>
        {claimed
          ? 'Solicita una ubicación GPS nueva antes de iniciar.'
          : 'Al iniciar, la visita quedará asignada a ti.'}
      </p>
      <p>Radio permitido: {visit.radiusMeters} m.</p>
      {source === 'mock' && <p>Ubicación simulada para demostración.</p>}
      {coordinates && (
        <Alert success>
          Distancia: {distance} m · Precisión: ±{Math.round(coordinates.accuracy)} m · Captura:{' '}
          {new Date(coordinates.capturedAt).toLocaleString('es-PE')}.
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="nf-actions">
        <Button variant="secondary" disabled={busy} onClick={request}>
          {busy ? 'Solicitando ubicación…' : 'Obtener ubicación'}
        </Button>
        <Button
          disabled={busy || !coordinates || (distance !== null && distance > visit.radiusMeters)}
          onClick={confirm}
        >
          Confirmar inicio
        </Button>
      </div>
    </Card>
  )
}
