import { exceptionLabel, type LocationException } from '../../types/models'
import { Badge } from '../../components/ui'
import { EvidenceGallery } from '../../components/EvidenceGallery'
import { displayDate } from '../../utils/dates'
import { AuditDetails } from './AuditDetails'
import { auditPerson } from '../../utils/auditPerson'

export function ExceptionSummary({ item }: { item: LocationException }) {
  const pending = item.approved === undefined
  return (
    <section className="nf-audit-event" aria-label={exceptionLabel(item)}>
      <h3>{exceptionLabel(item)}</h3>
      <Badge>{pending ? 'Pendiente' : item.approved ? 'Aprobada' : 'Rechazada'}</Badge>
      <AuditDetails
        fields={[
          ['Solicitud', displayDate(item.requestedAt)],
          ['Autor', auditPerson(item.authorId, item.authorName)],
          ['Motivo', item.reason],
          [
            'Revisor',
            auditPerson(
              item.reviewerId,
              item.reviewerName,
              pending ? 'Pendiente' : 'Sin registrar',
            ),
          ],
          ['Fecha de decisión', displayDate(item.reviewedAt)],
          [
            'Decisión',
            item.reviewReason || (pending ? 'Pendiente de revisión' : 'Sin motivo registrado'),
          ],
        ]}
      />
      <EvidenceGallery ids={item.evidenceIds ?? []} />
    </section>
  )
}
