import { exceptionLabel, type LocationException } from '../../types/models'
import { displayDate } from '../../utils/dates'
import { gpsFailureMessage, displayMeters } from '../../utils/gpsPresentation'
import { auditPerson } from '../../utils/auditPerson'
import { AuditDetails } from './AuditDetails'

export function ExceptionDetails({ item, radius }: { item: LocationException; radius?: number }) {
  return (
    <section className="nf-audit-event" aria-label={`Detalles de ${exceptionLabel(item)}`}>
      <h3>{exceptionLabel(item)}</h3>
      <AuditDetails
        fields={[
          ['ID de la excepción', item.id ?? 'Sin registrar'],
          ['Autor', auditPerson(item.authorId, item.authorName)],
          ['Solicitud', displayDate(item.requestedAt)],
          [
            'Revisor',
            auditPerson(
              item.reviewerId,
              item.reviewerName,
              item.approved === undefined ? 'Pendiente' : 'Sin registrar',
            ),
          ],
          ['Fecha de decisión', displayDate(item.reviewedAt)],
          ['Revisión', item.revision ?? 'Sin registrar'],
          ...(item.type === 'location'
            ? ([
                ['Ubicación', gpsFailureMessage(item.failure)],
                ['Latitud', item.telemetry?.latitude ?? 'Sin registrar'],
                ['Longitud', item.telemetry?.longitude ?? 'Sin registrar'],
                ['Precisión', displayMeters(item.telemetry?.accuracy)],
                ['Distancia', displayMeters(item.telemetry?.distanceMeters)],
                ['Radio', displayMeters(item.telemetry?.radiusMeters ?? radius)],
              ] as [string, string | number][])
            : []),
        ]}
      />
    </section>
  )
}
