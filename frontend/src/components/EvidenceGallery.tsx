import { useEffect, useState } from 'react'
import { useRepositories } from '../app/RepositoriesProvider'
import { useObjectUrl } from '../hooks/useObjectUrl'
import type { Evidence } from '../types/models'
import { Button } from './ui'
import { Image, ImageOff } from 'lucide-react'
function EvidenceImage({ id, onRemove }: { id: string; onRemove?: (id: string) => void }) {
  const { evidence } = useRepositories()
  const [item, setItem] = useState<Evidence>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
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
        <img src={url} alt={item?.name ?? 'Evidencia'} width="240" height="180" loading="lazy" />
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
        {item && (
          <small>
            {Math.ceil(item.size / 1024)} KB
            {item.uploadedAt && (
              <> · Cargada: {new Date(item.uploadedAt).toLocaleString('es-PE')}</>
            )}
            {item.capturedAt && (
              <> · Captura declarada: {new Date(item.capturedAt).toLocaleString('es-PE')}</>
            )}
          </small>
        )}
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
      {onRemove && (
        <Button variant="secondary" onClick={() => onRemove(id)}>
          Eliminar fotografía
        </Button>
      )}
    </figure>
  )
}
export function EvidenceGallery({
  ids,
  onRemove,
}: {
  ids: string[]
  onRemove?: (id: string) => void
}) {
  return (
    <div className="nf-evidence-grid">
      {ids.map((id) => (
        <EvidenceImage key={id} id={id} onRemove={onRemove} />
      ))}
    </div>
  )
}
