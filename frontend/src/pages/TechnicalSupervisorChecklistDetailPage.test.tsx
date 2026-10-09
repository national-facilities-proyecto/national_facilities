import 'fake-indexeddb/auto'
import { fireEvent, screen, within, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMockRepositories } from '../test/doubles/repositories'
import { createFixtures } from '../test/doubles/fixtures'
import { renderPage } from '../test/render'
import { AppError } from '../services/errors'
import type { Visit } from '../types/models'
import TechnicalSupervisorChecklistDetailPage from './TechnicalSupervisorChecklistDetailPage'

vi.mock('../components/EvidenceGallery', () => ({
  EvidenceGallery: ({ ids }: { ids: string[] }) => <p>{ids.join(',')}</p>,
}))
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
async function setup(overrides: Partial<Visit> = {}) {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 3 })
  const visit = {
    ...createFixtures().visits[0],
    status: 'pending_approval' as const,
    phase: 'in_review' as const,
    technicianName: 'Técnica autorizada',
    submittedAt: new Date().toISOString(),
    revision: 17,
    exceptions: [
      {
        id: 41,
        revision: 2,
        type: 'location' as const,
        scope: 'arrival' as const,
        reason: 'Llegada con lectura fuera de radio.',
        failure: 'out_of_radius',
        evidenceIds: ['arrival-proof'],
        telemetry: {
          latitude: -12.173911,
          longitude: -77.018111,
          accuracy: 9.87654,
          distanceMeters: 200.9876,
          radiusMeters: 100,
          capturedAt: Date.now(),
          failure: 'out_of_radius',
          validated: false,
        },
      },
      {
        id: 42,
        revision: 3,
        type: 'time_limit' as const,
        failure: '',
        scope: 'closure' as const,
        reason: 'Interrupción durante el registro de cierre.',
        evidenceIds: ['closure-proof'],
      },
    ],
  }
  Object.assign(visit, overrides)
  vi.spyOn(repos.checklists, 'get').mockResolvedValue(visit)
  const review = vi.spyOn(repos.visits, 'reviewException').mockResolvedValue(visit)
  renderPage(<TechnicalSupervisorChecklistDetailPage />, repos)
  await screen.findByText('Técnica autorizada')
  return { repos, visit, review }
}
it('prioriza cada pendiente, mantiene auditoría cerrada y muestra evidencia independiente', async () => {
  await setup()
  expect(screen.getByText('Técnica autorizada')).toBeVisible()
  expect(screen.getAllByRole('button', { name: 'Aprobar' })).toHaveLength(2)
  expect(screen.getAllByRole('button', { name: 'Rechazar' })).toHaveLength(2)
  expect(screen.getByText('arrival-proof')).toBeVisible()
  expect(screen.getByText('closure-proof')).toBeVisible()
  expect(screen.getAllByText('Llegada con lectura fuera de radio.')).toHaveLength(1)
  expect(screen.queryByText('-12.173911')).not.toBeInTheDocument()
  expect(screen.queryByText(/out_of_radius|Historial de reservas/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Detalles técnicos'))
  expect(await screen.findByText('-12.173911')).toBeVisible()
  expect(screen.getByText('9.9 m')).toBeVisible()
  expect(screen.getByText('201 m')).toBeVisible()
  expect(screen.getByText('Tu ubicación está fuera del área del establecimiento.')).toBeVisible()
})
it('valida junto al campo y envía únicamente la excepción seleccionada con sus revisiones', async () => {
  const { review, visit } = await setup()
  fireEvent.click(screen.getAllByRole('button', { name: 'Aprobar' })[0])
  const modal = screen.getByRole('dialog', { name: 'Aprobar excepción' })
  expect(within(modal).getByText(visit.exceptions[0].reason)).toBeVisible()
  expect(within(modal).queryByText(visit.exceptions[1].reason)).not.toBeInTheDocument()
  fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar decisión' }))
  expect(within(modal).getByLabelText('Motivo de aprobación')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(
    within(modal).getByText('Escribe al menos 10 caracteres para justificar la decisión.'),
  ).toBeVisible()
  expect(review).not.toHaveBeenCalled()
  fireEvent.change(within(modal).getByLabelText('Motivo de aprobación'), {
    target: { value: 'Fotografía y ubicación revisadas.' },
  })
  fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar decisión' }))
  await waitFor(() =>
    expect(review).toHaveBeenCalledExactlyOnceWith(
      visit.id,
      true,
      'Fotografía y ubicación revisadas.',
      41,
      { revision: 17, exceptionRevision: 2 },
    ),
  )
})
it('un conflicto conserva motivo y exige actualizar la revisión antes de decidir de nuevo', async () => {
  const { review } = await setup()
  review.mockRejectedValueOnce(new AppError('conflict', 'Otra sesión ya modificó la revisión.'))
  fireEvent.click(screen.getAllByRole('button', { name: 'Rechazar' })[1])
  fireEvent.change(screen.getByLabelText('Motivo de rechazo'), {
    target: { value: 'Falta aclarar la interrupción.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar decisión' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Otra sesión ya modificó')
  expect(screen.getByLabelText('Motivo de rechazo')).toHaveValue('Falta aclarar la interrupción.')
  expect(review.mock.calls[0][3]).toBe(42)
  expect(review.mock.calls[0][4]).toEqual({ revision: 17, exceptionRevision: 3 })
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar revisión' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('conserva decisiones actuales si el historial recibido contiene únicamente una versión anterior', async () => {
  const resolved = {
    id: 41,
    revision: 3,
    type: 'location' as const,
    scope: 'arrival' as const,
    reason: 'Motivo corregido y revisado.',
    failure: 'denied',
    approved: true,
    reviewReason: 'Evidencia de llegada comprobada.',
  }
  await setup({
    exceptions: [resolved],
    exceptionHistory: [
      {
        id: 'old-event',
        actorId: 1,
        at: new Date().toISOString(),
        kind: 'exception_previous',
        exception: {
          ...resolved,
          revision: 2,
          reason: 'Motivo original anterior.',
          approved: false,
          reviewReason: 'Falta precisión en el motivo.',
        },
      },
    ],
  })
  expect(screen.queryByText(resolved.reason)).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Historial de excepciones'))
  expect(await screen.findByText(resolved.reason)).toBeVisible()
  expect(screen.getByText('Motivo original anterior.')).toBeVisible()
})

it('no repite una solicitud pendiente como historial y conserva su telemetría expandible', async () => {
  const current = {
    id: 41,
    revision: 2,
    type: 'location' as const,
    scope: 'arrival' as const,
    reason: 'Solicitud vigente de llegada.',
    failure: 'denied',
    telemetry: {
      latitude: -12.123456,
      longitude: -77.123456,
      accuracy: 8,
      capturedAt: Date.now(),
      distanceMeters: null,
      radiusMeters: 100,
      failure: 'denied',
      validated: false,
    },
  }
  await setup({
    exceptions: [current],
    exceptionHistory: [
      {
        id: 'request',
        at: '2026-10-08T15:00:00Z',
        actorId: 1,
        kind: 'exception',
        exception: current,
      },
    ],
  })
  expect(screen.getAllByText(current.reason)).toHaveLength(1)
  expect(screen.queryByText('Historial de excepciones')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Detalles técnicos'))
  expect(await screen.findByText('-12.123456')).toBeVisible()
  expect(screen.getAllByText(current.reason)).toHaveLength(1)
})

it('conserva eventos auténticos de solicitud y decisión sin repetir su motivo', async () => {
  const resolved = {
    id: 41,
    revision: 2,
    type: 'location' as const,
    scope: 'arrival' as const,
    reason: 'Motivo original auténtico.',
    failure: 'denied',
    approved: true,
    reviewReason: 'Decisión histórica auténtica.',
  }
  await setup({
    exceptions: [resolved],
    exceptionHistory: [
      {
        id: 'request',
        at: '2026-10-08T15:00:00Z',
        actorId: 1,
        kind: 'exception',
        exception: { ...resolved, approved: undefined, reviewReason: undefined },
      },
      { id: 'review', at: '2026-10-08T16:00:00Z', actorId: 3, kind: 'review', exception: resolved },
    ],
  })
  fireEvent.click(screen.getByText('Historial de excepciones'))
  expect(await screen.findByText(resolved.reason)).toBeVisible()
  expect(screen.getAllByText(resolved.reason)).toHaveLength(1)
  expect(screen.getByText(resolved.reviewReason)).toBeVisible()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  fireEvent.click(screen.getByText('Detalles técnicos'))
  expect(screen.getAllByText(resolved.reason)).toHaveLength(1)
})

it('una decisión legacy sin ID se muestra una sola vez y mantiene su evento histórico', async () => {
  const resolved = {
    type: 'location' as const,
    scope: 'legacy' as const,
    reason: 'Motivo histórico sin identificador.',
    failure: 'denied',
    approved: true,
    reviewReason: 'Decisión histórica conservada.',
  }
  await setup({
    exceptions: [resolved],
    exceptionHistory: [
      {
        id: 'legacy-review',
        at: '2026-10-08T15:00:00Z',
        actorId: 3,
        kind: 'review',
        exception: resolved,
      },
    ],
  })
  fireEvent.click(screen.getByText('Historial de excepciones'))
  expect(await screen.findByText(resolved.reason)).toBeVisible()
  expect(screen.getAllByText(resolved.reason)).toHaveLength(1)
  expect(screen.getAllByText(resolved.reviewReason)).toHaveLength(1)
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
})

it('mantiene un evento auténtico de corrección aunque su motivo vigente ya aparezca en el resumen', async () => {
  const current = {
    id: 41,
    revision: 3,
    type: 'location' as const,
    scope: 'arrival' as const,
    reason: 'Motivo vigente corregido.',
    failure: 'denied',
  }
  await setup({
    exceptions: [current],
    exceptionHistory: [
      {
        id: 'corrected',
        at: '2026-10-08T15:00:00Z',
        actorId: 1,
        kind: 'exception_corrected',
        exception: current,
      },
    ],
  })
  fireEvent.click(screen.getByText('Historial de excepciones'))
  expect(await screen.findByText('Corrección enviada')).toBeVisible()
  expect(screen.getAllByText(current.reason)).toHaveLength(1)
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
})
