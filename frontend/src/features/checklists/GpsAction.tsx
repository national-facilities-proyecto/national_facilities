import { gpsMessages, gpsFailureMessage } from '../../utils/gpsPresentation'
import { useState } from 'react'
import type { Coordinates, Evidence, ExceptionInput, Visit } from '../../types/models'
import { useRepositories } from '../../app/RepositoriesProvider'
import { useLocationRequest } from '../geolocation/useLocation'
import { LocationError } from '../geolocation/location'
import { AppError, errorMessage } from '../../services/errors'
import { Alert, Button, Textarea } from '../../components/ui'
import { CameraModal } from '../technician/CameraModal'
import { EvidenceGallery } from '../../components/EvidenceGallery'

export function GpsAction({
  visit,
  onConfirmed,
  beforeStart,
}: {
  visit: Visit
  scope: 'arrival'
  onConfirmed: (visit: Visit) => void
  beforeStart?: () => Promise<Visit>
}) {
  const { visits, evidence } = useRepositories()
  const gps = useLocationRequest()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failure, setFailure] = useState('')
  const [reading, setReading] = useState<Coordinates>()
  const [requestingException, setRequestingException] = useState(false)
  const [reason, setReason] = useState('')
  const [camera, setCamera] = useState(false)
  const [photoId, setPhotoId] = useState(visit.arrivalEvidenceIds?.at(-1))
  const perform = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    setFailure('')
    setReading(undefined)
    setRequestingException(false)
    try {
      const prepared = beforeStart ? await beforeStart() : visit
      let location = await gps.request()
      setReading(location)
      let next: Visit
      try {
        next = await visits.start(prepared.id, location)
      } catch (cause) {
        if (!(cause instanceof AppError) || cause.fields.failure?.[0] !== 'stale') throw cause
        setReading(undefined)
        location = await gps.request()
        setReading(location)
        next = await visits.start(prepared.id, location)
      }
      onConfirmed(next)
    } catch (cause) {
      const code =
        cause instanceof LocationError
          ? cause.reason
          : cause instanceof AppError
            ? (cause.fields.failure?.[0] ?? '')
            : ''
      setError(code ? gpsFailureMessage(code) : errorMessage(cause))
      setFailure(code)
    } finally {
      setBusy(false)
    }
  }
  const uploadPhoto = async (photo: Evidence) => {
    await evidence.put({ ...photo, visitId: visit.id, purpose: 'arrival' })
    setPhotoId(photo.id)
  }
  const requestException = async () => {
    if (busy || !photoId) return
    setBusy(true)
    setError('')
    const input: ExceptionInput = {
      type: 'location',
      scope: 'arrival',
      reason,
      failure,
      evidenceId: photoId,
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
      <div className="nf-actions">
        <Button disabled={busy} onClick={() => void perform()}>
          {busy ? 'Registrando ubicación…' : failure ? 'Reintentar ubicación' : 'Registrar llegada'}
        </Button>
        {gpsMessages[failure] && (
          <Button variant="secondary" disabled={busy} onClick={() => setRequestingException(true)}>
            Solicitar excepción GPS
          </Button>
        )}
      </div>
      {requestingException && (
        <>
          <p>
            Explica qué ocurrió y fotografía el establecimiento para continuar. El supervisor
            revisará tu llegada.
          </p>
          <Textarea
            label="Motivo de la excepción"
            minLength={10}
            maxLength={500}
            value={reason}
            rows={3}
            errors={reason.trim().length < 10 ? ['Escribe al menos 10 caracteres.'] : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {photoId && (
            <>
              <EvidenceGallery ids={[photoId]} />
            </>
          )}
          <div className="nf-actions">
            <Button variant="secondary" disabled={busy} onClick={() => setCamera(true)}>
              {photoId ? 'Tomar otra foto del establecimiento' : 'Tomar foto del establecimiento'}
            </Button>
            <Button
              disabled={busy || reason.trim().length < 10 || !photoId}
              onClick={() => void requestException()}
            >
              Guardar excepción GPS
            </Button>
          </div>
        </>
      )}
      <CameraModal open={camera} onClose={() => setCamera(false)} onCapture={uploadPhoto} />
    </>
  )
}
