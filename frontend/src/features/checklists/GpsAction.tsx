import { useState } from 'react'
import type { Coordinates, ExceptionInput, Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useLocationRequest } from '../geolocation/useLocation'
import { LocationError } from '../geolocation/location'
import { AppError, errorMessage } from '../../services/errors'
import { Alert, Button, Textarea } from '../../components/ui'

export function GpsAction({
  visit,
  scope,
  onConfirmed,
}: {
  visit: Visit
  scope: 'arrival' | 'closure'
  onConfirmed: (visit: Visit) => void
}) {
  const { visits } = useRepositories()
  const gps = useLocationRequest()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failure, setFailure] = useState('')
  const [reading, setReading] = useState<Coordinates>()
  const [requestingException, setRequestingException] = useState(false)
  const [reason, setReason] = useState('')
  const action =
    scope === 'arrival'
      ? 'Registrar llegada'
      : visit.origin === 'checklist'
        ? 'Terminar recorrido'
        : 'Terminar atención'
  const perform = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setFailure('')
    setReading(undefined)
    setRequestingException(false)
    const send = (id: number, location: Coordinates) =>
      scope === 'arrival' ? visits.start(id, location) : visits.recordEndGps(id, location)
    try {
      let location = await gps.request()
      setReading(location)
      let next: Visit
      try {
        next = await send(visit.id, location)
      } catch (cause) {
        if (!(cause instanceof AppError) || cause.fields.failure?.[0] !== 'stale') throw cause
        // El servidor determina si caducó: una nueva lectura no reutiliza la rechazada.
        setReading(undefined)
        location = await gps.request()
        setReading(location)
        next = await send(visit.id, location)
      }
      onConfirmed(next)
    } catch (cause) {
      setError(errorMessage(cause))
      setFailure(
        cause instanceof LocationError
          ? cause.reason
          : cause instanceof AppError
            ? (cause.fields.failure?.[0] ?? '')
            : '',
      )
    } finally {
      setBusy(false)
    }
  }
  const requestException = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const input: ExceptionInput = {
      type: 'location',
      scope,
      reason,
      failure,
      ...(reading ? { location: reading } : {}),
    }
    try {
      onConfirmed(await visits.requestException(visit.id, input))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {error && <Alert>{error}</Alert>}
      {reading && (
        <p>
          Lectura real: {reading.latitude}, {reading.longitude} · Precisión ±{reading.accuracy} m.
        </p>
      )}
      <div className="nf-actions">
        <Button disabled={busy} onClick={() => void perform()}>
          {busy ? 'Registrando ubicación…' : error ? 'Reintentar ubicación' : action}
        </Button>
        {[
          'denied',
          'timeout',
          'unavailable',
          'out_of_radius',
          'low_accuracy',
          'outside',
          'inaccurate',
          'stale',
        ].includes(failure) && (
          <Button variant="secondary" disabled={busy} onClick={() => setRequestingException(true)}>
            Solicitar excepción GPS
          </Button>
        )}
      </div>
      {requestingException && (
        <>
          <p>
            {scope === 'arrival' ? 'GPS de llegada' : 'GPS de cierre'}: la solicitud conserva los
            datos reales y permite continuar bajo excepción pendiente. No envía el registro a
            revisión.
          </p>
          <Textarea
            label="Justificación de la excepción"
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            disabled={busy || reason.trim().length < 10}
            onClick={() => void requestException()}
          >
            Guardar excepción GPS
          </Button>
        </>
      )}
    </>
  )
}
