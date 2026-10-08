import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createFixtures } from '../../test/doubles/fixtures'
import { VisitRecord } from './VisitRecord'
import { displayDuration } from '../../utils/durations'
import { submissionMessage } from './submissionMessage'
import { auditPerson } from '../../utils/auditPerson'
import { VisitTiming } from './VisitTiming'
import { ExceptionHistory } from './ExceptionHistory'
import { ExceptionDetails } from './ExceptionDetails'
import { Disclosure } from '../../components/ui/Disclosure'
import type { Visit } from '../../types/models'

vi.mock('../../components/EvidenceGallery', () => ({ EvidenceGallery: () => null }))
afterEach(cleanup)
// Auditoría exclusiva del supervisor, independiente del resumen del técnico.
function AuditRecord({ visit }: { visit: Visit }) {
  return (
    <>
      <Disclosure title="Detalles técnicos">
        <VisitTiming visit={visit} />
        {visit.exceptions?.map((item, index) => (
          <ExceptionDetails key={item.id ?? index} item={item} />
        ))}
      </Disclosure>
      <Disclosure title="Historial de excepciones">
        <ExceptionHistory visit={visit} />
      </Disclosure>
    </>
  )
}

it.each([
  [43064.997793, '11 h 57 min 44 s'],
  [966.588154, '16 min 6 s'],
  [42027.201111, '11 h 40 min 27 s'],
  [3600, '1 h 0 min 0 s'],
  [0, '0 s'],
  [0.9, '0 s'],
  [null, 'Sin registrar'],
  [undefined, 'Sin registrar'],
  [-1, 'Duración no válida (registro histórico)'],
  [NaN, 'Duración no válida (registro histórico)'],
  [Infinity, 'Duración no válida (registro histórico)'],
  [90061, '25 h 1 min 1 s'],
])('formatea %s sin limitar ni inventar la duración', (value, expected) => {
  expect(displayDuration(value)).toBe(expected)
})

it('conserva eventos y distingue autor, actor y revisor histórico', async () => {
  const visit = createFixtures().visits[0]
  const original = {
    type: 'location' as const,
    scope: 'arrival' as const,
    reason: 'Primera justificación\nCon más detalle',
    failure: 'denied',
    authorId: 1,
    authorName: 'Ana Técnica',
    reviewerId: 4,
    reviewerName: 'Luis Supervisor',
    approved: false,
    reviewReason: 'Falta detalle',
  }
  render(
    <AuditRecord
      visit={{
        ...visit,
        answers: [],
        totalSeconds: 43064.997793,
        executionSeconds: -1,
        registrationSeconds: undefined,
        exceptions: [{ ...original, reviewerId: 5, reviewerName: 'Rosa Revisora', approved: true }],
        exceptionHistory: [
          {
            id: 'a',
            at: '2026-10-01T10:00:00Z',
            actorId: 4,
            actorName: 'Luis Supervisor',
            kind: 'review',
            exception: original,
          },
          {
            id: 'b',
            at: '2026-10-01T11:00:00Z',
            actorId: 1,
            actorName: 'Ana Técnica',
            kind: 'exception_previous',
            exception: original,
          },
        ],
      }}
    />,
  )
  expect(screen.queryByText('11 h 57 min 44 s')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Detalles técnicos'))
  expect(await screen.findByText('11 h 57 min 44 s')).toBeVisible()
  fireEvent.click(screen.getByText('Historial de excepciones'))
  await screen.findByText('Versión anterior conservada')
  expect(screen.getByText('Duración no válida (registro histórico)')).toBeVisible()
  const events = screen.getAllByRole('listitem')
  expect(events).toHaveLength(2)
  expect(within(events[0]).getAllByText('Luis Supervisor (ID #4)')).toHaveLength(2)
  expect(within(events[0]).getByText('Ana Técnica (ID #1)')).toBeVisible()
  expect(within(events[0]).getByText('Rechazada')).toBeVisible()
  expect(within(events[1]).getByText('Versión anterior conservada')).toBeVisible()
  expect(screen.getByText('Rosa Revisora (ID #5)')).toBeVisible()
  expect(auditPerson(17)).toBe('Usuario #17')
  expect(auditPerson(undefined, 'Nombre no asociado')).toBe('Sin registrar')
})

it('no muestra reservas operativas y conserva los datos recibidos', () => {
  render(
    <VisitRecord
      visit={{
        ...createFixtures().visits[0],
        claimHistory: [
          {
            id: 'r',
            at: '2026-10-01T10:00:00Z',
            technicianId: 1,
            technicianName: 'Ana Técnica',
            kind: 'claim_release',
            claimedAt: '2026-10-01T09:00:00Z',
            expiresAt: '2026-10-01T10:00:00Z',
            text: 'Reserva liberada',
          },
        ],
      }}
    />,
  )
  expect(screen.queryByText('Historial de reservas')).not.toBeInTheDocument()
  expect(screen.queryByText('Reserva liberada')).not.toBeInTheDocument()
})

it('solo anuncia finalización definitiva para el estado completed', () => {
  expect(submissionMessage('completed').title).toBe('Trabajo finalizado')
  expect(submissionMessage('pending_approval').title).toBe('En revisión')
  expect(submissionMessage('correction_required').title).toBe('Registro recibido')
  expect(submissionMessage('in_progress').title).toBe('Registro recibido')
})

it('conserva reporte general y respuestas históricas aunque ya no exista la tarea en el snapshot', () => {
  const visit = createFixtures().visits[0]
  render(
    <VisitRecord
      visit={{
        ...visit,
        workDescription: 'Reporte general autorizado.',
        answers: [
          {
            taskId: 999,
            result: 'no_conforme',
            observation: 'Observación histórica conservada.',
            evidenceIds: ['historical-photo'],
          },
        ],
      }}
    />,
  )
  expect(screen.getByText('Reporte general autorizado.')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Actividad histórica #999' })).toBeVisible()
  expect(screen.getByText('Observación histórica conservada.')).toBeVisible()
})

it.each([undefined, true, false])(
  'el técnico ve una sola excepción actual %s sin IDs, historial o telemetría',
  (approved) => {
    const exception = {
      id: 41,
      revision: 2,
      type: 'location' as const,
      scope: 'arrival' as const,
      reason: 'Motivo actual de llegada.',
      approved,
      reviewReason: approved === undefined ? undefined : 'Decisión del supervisor.',
      failure: 'denied',
      telemetry: {
        latitude: -12.123456,
        longitude: -77.123456,
        accuracy: 8,
        distanceMeters: null,
        radiusMeters: 100,
        failure: 'denied',
        validated: false,
        capturedAt: Date.now(),
      },
      authorId: 1,
    }
    render(
      <VisitRecord
        visit={{
          ...createFixtures().visits[0],
          exceptions: [exception],
          exceptionHistory: [
            {
              id: 'original',
              at: '2026-10-08T15:00:00Z',
              actorId: 1,
              kind: 'exception',
              exception,
            },
          ],
        }}
      />,
    )
    expect(screen.getAllByText(exception.reason)).toHaveLength(1)
    expect(
      within(screen.getByRole('region', { name: 'GPS de llegada' })).getByText(
        approved === undefined ? 'Pendiente' : approved ? 'Aprobada' : 'Rechazada',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Historial de excepciones')).not.toBeInTheDocument()
    expect(screen.queryByText('Detalles técnicos')).not.toBeInTheDocument()
    expect(screen.queryByText('-12.123456')).not.toBeInTheDocument()
    expect(screen.queryByText(/ID #|ID de la excepción|Usuario #/)).not.toBeInTheDocument()
  },
)
