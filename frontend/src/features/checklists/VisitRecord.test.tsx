import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createFixtures } from '../../test/doubles/fixtures'
import { VisitRecord } from './VisitRecord'
import { ClaimHistory } from './ClaimHistory'
import { displayDuration } from '../../utils/durations'
import { submissionMessage } from './submissionMessage'
import { auditPerson } from '../../utils/auditPerson'

vi.mock('../../components/EvidenceGallery', () => ({ EvidenceGallery: () => null }))
afterEach(cleanup)

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

it('conserva eventos y distingue autor, actor y revisor histórico', () => {
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
    <VisitRecord
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
  expect(screen.getByText('11 h 57 min 44 s')).toBeVisible()
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

it('muestra reserva del técnico y liberación por sistema sin confundir al autor', () => {
  render(
    <ClaimHistory
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
  expect(screen.getByText('Ana Técnica (ID #1)')).toBeVisible()
  expect(screen.getByText('Sistema')).toBeVisible()
})

it('solo anuncia finalización definitiva para el estado completed', () => {
  expect(submissionMessage('completed').title).toBe('Trabajo finalizado')
  expect(submissionMessage('pending_approval').title).toBe('En revisión')
  expect(submissionMessage('correction_required').title).toBe('Registro recibido')
  expect(submissionMessage('in_progress').title).toBe('Registro recibido')
})
