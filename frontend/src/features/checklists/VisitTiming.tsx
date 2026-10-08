import type { Visit } from '../../types/models'
import { displayDate } from '../../utils/dates'
import { displayDuration } from '../../utils/durations'
import { AuditDetails } from './AuditDetails'
import { auditPerson } from '../../utils/auditPerson'

export function VisitTiming({ visit }: { visit: Visit }) {
  return (
    <>
      <AuditDetails
        fields={[
          ['ID de la visita', visit.id],
          ['Técnico', auditPerson(visit.technicianId, visit.technicianName)],
          ['Inicio real', displayDate(visit.startedAt)],
          ['Fin del trabajo físico', displayDate(visit.physicalEndedAt)],
          ['Primera apertura del registro', displayDate(visit.formOpenedAt)],
          ['Envío aceptado', displayDate(visit.submittedAt)],
          ['Finalización definitiva', displayDate(visit.completedAt)],
        ]}
      />
      <AuditDetails
        fields={[
          ['Duración total', displayDuration(visit.totalSeconds)],
          ['Trabajo físico', displayDuration(visit.executionSeconds)],
          ['Registro', displayDuration(visit.registrationSeconds)],
        ]}
      />
      <p className="nf-muted">
        Duraciones hasta el envío aceptado; la revisión posterior no forma parte del total. El
        trabajo físico y el registro pueden tener un intervalo entre etapas.
      </p>
      {visit.legacy && <p>Historial anterior: los eventos que faltan permanecen sin registrar.</p>}
      {visit.expiresAt && (
        <p>
          Vencimiento histórico: {displayDate(visit.expiresAt)}. El registro actual no tiene plazo.
        </p>
      )}
    </>
  )
}
