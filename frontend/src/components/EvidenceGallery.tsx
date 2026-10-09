import { useEffect, useState } from 'react'
import { useRepositories } from '../app/RepositoriesProvider'
import { useObjectUrl } from '../hooks/useObjectUrl'
import type { Evidence } from '../types/models'
import { Button } from './ui'
import { Modal } from './ui/Modal'
import { Image, ImageOff } from 'lucide-react'
function EvidenceImage({
  id,
  onRemove,
  onReplace,
  disabled,
}: {
  id: string
  onRemove?: (id: string) => void
  onReplace?: (id: string) => void
  disabled?: boolean
}) {
  const { evidence } = useRepositories()
  const [item, setItem] = useState<Evidence>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let active = true
    void evidence.get(id).then(
      (value) => {
        if (active) {
          setItem(value)
          setFailed(!value)
        }
      },
      () => {
        if (active) setFailed(true)
      },
    )
    return () => {
      active = false
    }
  }, [evidence, id, attempt])
  const url = useObjectUrl(item?.blob)
  return (
    <figure className="nf-evidence">
      {url ? (
        <Button
          variant="secondary"
          className="nf-image-button"
          aria-label={`Ampliar fotografía ${item?.name ?? ''}`}
          onClick={() => setExpanded(true)}
        >
          <img src={url} alt={item?.name ?? 'Evidencia'} width="240" height="180" loading="lazy" />
        </Button>
      ) : (
        <div className="nf-evidence-placeholder" role="status">
          {failed ? (
            <ImageOff size={28} aria-hidden="true" />
          ) : (
            <Image size={28} aria-hidden="true" />
          )}
          <p>{failed ? 'Evidencia no disponible' : 'Cargando foto…'}</p>
          {!failed && <span className="nf-skeleton" aria-hidden="true" />}
        </div>
      )}
      <figcaption>
        {item?.source === 'camera'
          ? 'Cámara'
          : item?.source === 'gallery'
            ? 'Galería'
            : 'Archivo adjunto'}
      </figcaption>
      {failed && (
        <Button
          variant="secondary"
          onClick={() => {
            setFailed(false)
            setAttempt((value) => value + 1)
          }}
        >
          Reintentar fotografía
        </Button>
      )}
      <div className="nf-photo-actions">
        {onReplace && (
          <Button variant="secondary" disabled={disabled} onClick={() => onReplace(id)}>
            Reemplazar fotografía
          </Button>
        )}
        {onRemove && (
          <Button variant="secondary" disabled={disabled} onClick={() => onRemove(id)}>
            Eliminar fotografía
          </Button>
        )}
      </div>
      <Modal open={expanded} title="Fotografía ampliada" onClose={() => setExpanded(false)}>
        <img className="nf-image-preview" src={url} alt={item?.name ?? 'Evidencia'} />
      </Modal>
    </figure>
  )
}
export function EvidenceGallery({
  ids,
  onRemove,
  onReplace,
  disabled,
}: {
  ids: string[]
  onRemove?: (id: string) => void
  onReplace?: (id: string) => void
  disabled?: boolean
}) {
  return (
    <div className="nf-evidence-grid">
      {ids.map((id) => (
        <EvidenceImage
          key={id}
          id={id}
          onRemove={onRemove}
          onReplace={onReplace}
          disabled={disabled}
        />
      ))}
    </div>
  )
}
