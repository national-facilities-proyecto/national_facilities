import type { ReactNode } from 'react'
import { exceptionLabel, type LocationException } from '../../types/models'
import { Badge } from '../../components/ui'
import { EvidenceGallery } from '../../components/EvidenceGallery'

export function ExceptionSummary({
  item,
  actions,
}: {
  item: LocationException
  actions?: ReactNode
}) {
  return (
    <section className="nf-exception" aria-label={exceptionLabel(item)}>
      <header>
        <h3>{exceptionLabel(item)}</h3>
        <Badge>
          {item.approved === undefined ? 'Pendiente' : item.approved ? 'Aprobada' : 'Rechazada'}
        </Badge>
      </header>
      <p className="nf-exception__reason">{item.reason}</p>
      <EvidenceGallery ids={item.evidenceIds ?? []} />
      {item.reviewReason && (
        <p>
          <strong>Decisión:</strong> {item.reviewReason}
        </p>
      )}
      {actions && <div className="nf-actions">{actions}</div>}
    </section>
  )
}
