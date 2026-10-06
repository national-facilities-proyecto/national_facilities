import { useEffect, useId, useRef, useState } from 'react'
import type { Evidence, Visit } from '../../types/models'
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
  tasks,
  onAssociate,
}: {
  scope: string
  tasks: Visit['tasks']
  onAssociate?: (photo: Evidence, taskId: number) => Promise<void>
}) {
  const [photos, setPhotos] = useState<Evidence[]>([])
  const formId = useId()
  const [camera, setCamera] = useState(false)
  const associating = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [targets, setTargets] = useState<Record<string, string>>({})
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
    if (!onAssociate || (tasks.length > 0 && !targets[photo.id]) || associating.current) return
    associating.current = true
    setBusy(true)
    setError('')
    try {
      await onAssociate(photo, tasks.length ? Number(targets[photo.id]) : 0)
      await discard(photo.id)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      associating.current = false
      setBusy(false)
    }
  }
  return (
    <Card title={tasks.length ? 'Fotografías del recorrido' : 'Fotografías de la atención'}>
      <p>
        {tasks.length
          ? 'Estas fotos se conservan en este navegador para asociarlas a los ítems del formulario final.'
          : 'Estas fotos se conservan en este navegador para asociarlas al registro de resolución.'}
      </p>
      {!onAssociate && (
        <Button variant="secondary" onClick={() => setCamera(true)}>
          {tasks.length ? 'Tomar fotografía del recorrido' : 'Tomar fotografía de la atención'}
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
                {tasks.length > 0 && (
                  <>
                    <label htmlFor={`${formId}-${photo.id}`}>
                      Ítem para fotografía {index + 1}
                    </label>
                    <select
                      id={`${formId}-${photo.id}`}
                      value={targets[photo.id] ?? ''}
                      disabled={busy}
                      onChange={(event) =>
                        setTargets((current) => ({ ...current, [photo.id]: event.target.value }))
                      }
                    >
                      <option value="">Selecciona un ítem</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <Button
                  disabled={busy || (tasks.length > 0 && !targets[photo.id])}
                  onClick={() => void associate(photo)}
                >
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
