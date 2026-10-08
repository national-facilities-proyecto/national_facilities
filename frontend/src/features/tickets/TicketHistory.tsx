import type { TimelineEvent } from '../../types/models'
import { displayDate } from '../../utils/dates'
import { Disclosure } from '../../components/ui/Disclosure'

function ticketEventLabel(event: TimelineEvent) {
  const labels: Record<string, string> = {
    report: 'Incidencia reportada',
    schedule: event.previous?.technicianId ? 'Atención reprogramada' : 'Atención programada',
    arrival: 'Llegada registrada',
    physical_end: 'Trabajo físico terminado',
    finish_work: 'Trabajo físico terminado',
    open_form: 'Registro del resultado iniciado',
    submit: 'Resultados enviados',
    complete: 'Atención finalizada',
    review_complete: 'Atención finalizada',
    exception: 'Excepción GPS solicitada',
    exception_corrected: 'Justificación corregida',
    review: 'Excepción revisada',
    review_exception: 'Excepción revisada',
    not_performed: 'Trabajo no realizado',
    invalidate: 'Programación anterior sustituida',
    draft: 'Resultado guardado',
  }
  return labels[event.kind ?? ''] ?? labels[event.text] ?? event.text
}

export function TicketHistory({
  events,
  account,
  person,
  priority,
}: {
  events: TimelineEvent[]
  account: boolean
  person: (id?: number) => string
  priority: (id?: number) => string
}) {
  // Invalidations belong to the technical audit, not a second operative change.
  // Legacy events remain separate; timestamps alone never correlate events.
  const technical = events.filter(
    (event) =>
      event.kind === 'invalidate' || (!event.kind && event.text === 'Programación sustituida'),
  )
  const main = events.filter((event) => !technical.includes(event))
  const row = (event: TimelineEvent, audit = false) => (
    <li key={event.id}>
      <strong>{ticketEventLabel(event)}</strong>
      <p>
        {displayDate(event.at)} — {event.actorName ?? person(event.actorId)}
      </p>
      {event.reason && <p>Motivo: {event.reason}</p>}
      {account && (event.previous || event.next) && (
        <Disclosure title="Ver cambio de programación">
          {event.previous && (
            <p>
              Anterior: {person(event.previous.technicianId)} —{' '}
              {displayDate(event.previous.scheduledAt)} — Prioridad{' '}
              {priority(event.previous.priorityId)}
            </p>
          )}
          {event.next && (
            <p>
              Nueva: {person(event.next.technicianId)} — {displayDate(event.next.scheduledAt)} —
              Prioridad {priority(event.next.priorityId)}
            </p>
          )}
          <small>Evento de auditoría #{event.id}</small>
        </Disclosure>
      )}
      {audit && <small>Evento de auditoría #{event.id}</small>}
    </li>
  )
  return (
    <>
      <ol className="nf-timeline">{main.slice(-5).map((event) => row(event))}</ol>
      {main.length > 5 && (
        <Disclosure title={`Eventos anteriores (${main.length - 5})`}>
          <ol className="nf-timeline">{main.slice(0, -5).map((event) => row(event))}</ol>
        </Disclosure>
      )}
      {account && technical.length > 0 && (
        <Disclosure title="Auditoría de programaciones sustituidas">
          <ol className="nf-timeline">{technical.map((event) => row(event, true))}</ol>
        </Disclosure>
      )}
    </>
  )
}
