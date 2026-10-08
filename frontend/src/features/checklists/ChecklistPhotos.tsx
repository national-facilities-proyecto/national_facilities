import { useEffect, useRef, useState } from 'react'
import type { Evidence } from '../../types/models'
import { checklistPhotos } from '../../services/checklistPhotos'
import { errorMessage } from '../../services/errors'
import { useObjectUrl } from '../../hooks/useObjectUrl'
import { CameraModal } from '../technician/CameraModal'
import { Alert, Button, Card } from '../../components/ui'

function Photo({ photo }: { photo: Evidence }) {
  const url = useObjectUrl(photo.blob)
  return <img src={url} alt="Fotografía pendiente de asociación" width="240" height="180" />
}

export function ChecklistPhotos({
  scope,
  onAssociate,
}: {
  scope: string
  onAssociate?: (photo: Evidence) => Promise<void>
}) {
  const [photos, setPhotos] = useState<Evidence[]>([])
  const [camera, setCamera] = useState(false)
  const associating = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void checklistPhotos.list(scope).then(
      (items) => {
        if (active) setPhotos(items)
      },
      (cause) => {
        if (active) setError(errorMessage(cause))
      },
    )
    return () => {
      active = false
    }
  }, [scope])
  const discard = async (id: string) => {
    await checklistPhotos.remove(scope, id)
    setPhotos((current) => current.filter((photo) => photo.id !== id))
  }
  const associate = async (photo: Evidence) => {
    if (!onAssociate || associating.current) return
    associating.current = true
    setBusy(true)
    setError('')
    try {
      await onAssociate(photo)
      await discard(photo.id)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      associating.current = false
      setBusy(false)
    }
  }
  return (
    <Card title="Fotografías de la atención">
      <p>Estas fotos se conservan en este navegador para asociarlas al registro de resolución.</p>
      {!onAssociate && (
        <Button variant="secondary" onClick={() => setCamera(true)}>
          Tomar fotografía de la atención
        </Button>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="nf-evidence-grid">
        {photos.map((photo, index) => (
          <figure key={photo.id} className="nf-evidence">
            <Photo photo={photo} />
            <figcaption>Fotografía {index + 1} · pendiente de asociación</figcaption>
            {onAssociate && (
              <>
                <Button disabled={busy} onClick={() => void associate(photo)}>
                  Asociar fotografía
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void discard(photo.id).catch((cause) => setError(errorMessage(cause)))}
            >
              Eliminar fotografía pendiente
            </Button>
          </figure>
        ))}
      </div>
      {photos.length === 0 && <p>No hay fotografías pendientes de asociación.</p>}
      <CameraModal
        open={camera}
        onClose={() => setCamera(false)}
        onCapture={async (photo) => {
          await checklistPhotos.put(scope, photo)
          setPhotos((current) => [...current, photo])
          setCamera(false)
        }}
      />
    </Card>
  )
}
