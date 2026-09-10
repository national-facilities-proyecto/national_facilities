import { useEffect, useState } from 'react'
import { useRepositories } from '../app/RepositoriesProvider'
import { useObjectUrl } from '../hooks/useObjectUrl'
import type { Evidence } from '../types/models'
import { Button } from './ui'
function EvidenceImage({ id, onRemove }: { id: string; onRemove?: (id: string) => void }) {
  const { evidence } = useRepositories()
  const [item, setItem] = useState<Evidence>()
  const [failed, setFailed] = useState(false)
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
  }, [evidence, id])
  const url = useObjectUrl(item?.blob)
  return (
    <figure className="nf-evidence">
      {url ? (
        <img src={url} alt={item?.name ?? 'Evidencia'} width="240" height="180" loading="lazy" />
      ) : (
        <p role="status">{failed ? 'Evidencia no disponible' : 'Cargando foto…'}</p>
      )}
      <figcaption>
        {item?.source === 'camera' ? 'Capturada en cámara' : 'Adjunto del reporte'}
        {item && (
          <small>
            {Math.ceil(item.size / 1024)} KB · {new Date(item.capturedAt).toLocaleString('es-PE')}
          </small>
        )}
      </figcaption>
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
