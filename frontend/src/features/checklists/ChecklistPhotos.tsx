import { useEffect, useRef, useState } from 'react'
import type { Evidence } from '../../types/models'
import { checklistPhotos } from '../../services/checklistPhotos'
import { errorMessage } from '../../services/errors'
import { useObjectUrl } from '../../hooks/useObjectUrl'
import { CameraModal } from '../technician/CameraModal'
import { Alert, Button, Card } from '../../components/ui'
import { Modal } from '../../components/ui/Modal'

function Photo({ photo }: { photo: Evidence }) {
  const url = useObjectUrl(photo.blob)
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <Button
        variant="secondary"
        className="nf-image-button"
        aria-label="Ampliar fotografía del trabajo"
        onClick={() => setExpanded(true)}
      >
        <img src={url} alt="Fotografía del trabajo" width="240" height="180" />
      </Button>
      <Modal open={expanded} title="Fotografía ampliada" onClose={() => setExpanded(false)}>
        <img className="nf-image-preview" src={url} alt="Fotografía del trabajo ampliada" />
      </Modal>
    </>
  )
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
    <>
      {(!onAssociate || photos.length > 0 || error) && (
        <Card title={onAssociate ? 'Fotografías por guardar' : 'Fotografías del trabajo'}>
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
                <figcaption>Fotografía {index + 1}</figcaption>
                {onAssociate && (
                  <>
                    <Button disabled={busy} onClick={() => void associate(photo)}>
                      Guardar fotografía
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void discard(photo.id).catch((cause) => setError(errorMessage(cause)))
                  }
                >
                  Eliminar fotografía
                </Button>
              </figure>
            ))}
          </div>
        </Card>
      )}
      <CameraModal
        open={camera}
        onClose={() => setCamera(false)}
        onCapture={async (photo) => {
          await checklistPhotos.put(scope, photo)
          setPhotos((current) => [...current, photo])
          setCamera(false)
        }}
      />
    </>
  )
}
