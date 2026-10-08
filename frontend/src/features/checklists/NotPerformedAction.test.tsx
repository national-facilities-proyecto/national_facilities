import 'fake-indexeddb/auto'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMockRepositories } from '../../test/doubles/repositories'
import { readDatabase, writeDatabase } from '../../test/doubles/storage'
import { renderPage } from '../../test/render'
import { AppError } from '../../services/errors'
import { NotPerformedAction } from './NotPerformedAction'
import { canMarkNotPerformed } from './notPerformed'
import { VisitEditor } from './VisitEditor'
import { TicketDetail } from '../tickets/TicketDetail'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
async function activeChecklist() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  const visit = await repos.visits.start(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  return { repos, visit }
}
async function confirm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Marcar como no realizado' }))
  const dialog = await screen.findByRole('dialog', { name: 'Marcar como no realizado' })
  fireEvent.change(within(dialog).getByLabelText('Motivo'), {
    target: { value: 'No fue posible acceder al equipo de la tienda.' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar no realizado' }))
}
async function scheduledTicket() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 2 })
  const ticket = await repos.tickets.create({
    storeId: 1,
    category: 'Plomería',
    priority: 'Alta',
    description: 'Fuga reportada en el baño de la tienda.',
    evidenceIds: [],
  })
  await repos.auth.login({ kind: 'demo', userId: 3 })
  const scheduled = await repos.tickets.schedule(ticket.id, 1, new Date().toISOString(), 'Alta', '')
  return { repos, ticket, visitId: scheduled.visitId! }
}

it('exige motivo de 10 caracteres, pide confirmación y cancelar no llama a la API', async () => {
  const { repos, visit } = await activeChecklist()
  const request = vi.spyOn(repos.visits, 'markNotPerformed')
  const onConfirmed = vi.fn()
  renderPage(<NotPerformedAction visit={visit} onConfirmed={onConfirmed} />, repos)
  fireEvent.click(await screen.findByRole('button', { name: 'Marcar como no realizado' }))
  expect(screen.getByText('No realizado no cuenta como trabajo completado.')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'corto' } })
  expect(screen.getByRole('button', { name: 'Confirmar no realizado' })).toBeDisabled()
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(request).not.toHaveBeenCalled()
  await confirm()
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce())
  expect(request).toHaveBeenCalledExactlyOnceWith(
    1,
    'No fue posible acceder al equipo de la tienda.',
  )
  expect(onConfirmed.mock.calls[0][0]).toMatchObject({
    phase: 'not_performed',
    readOnly: true,
    occupiesTechnician: false,
  })
})
it('un rechazo del servidor conserva la ejecución y muestra el error en el modal', async () => {
  const { repos, visit } = await activeChecklist()
  vi.spyOn(repos.visits, 'markNotPerformed').mockRejectedValue(
    new AppError('conflict', 'La ejecución cambió en otro dispositivo.'),
  )
  const onConfirmed = vi.fn()
  renderPage(<NotPerformedAction visit={visit} onConfirmed={onConfirmed} />, repos)
  await confirm()
  expect(await screen.findByRole('alert')).toHaveTextContent('La ejecución cambió')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(onConfirmed).not.toHaveBeenCalled()
  expect((await repos.visits.get(1)).phase).toBe('physical_work')
})
it.each([
  ['completed', 'finished'],
  ['pending_approval', 'in_review'],
  ['cancelled', 'not_performed'],
] as const)('no ofrece acción en %s', async (status, phase) => {
  const { repos, visit } = await activeChecklist()
  renderPage(<NotPerformedAction visit={{ ...visit, status, phase, readOnly: true }} />, repos)
  expect(screen.queryByRole('button', { name: 'Marcar como no realizado' })).not.toBeInTheDocument()
  expect(canMarkNotPerformed({ ...visit, status, phase }, 'technician')).toBe(false)
})
it('permite Corrección requerida iniciada y rechaza readonly, reservas y supervisor de tienda', async () => {
  const { visit } = await activeChecklist()
  expect(
    canMarkNotPerformed(
      { ...visit, status: 'correction_required', phase: 'correction_required' },
      'technician',
    ),
  ).toBe(true)
  expect(canMarkNotPerformed({ ...visit, readOnly: true }, 'technician')).toBe(false)
  expect(
    canMarkNotPerformed(
      { ...visit, startedAt: undefined, status: 'claimed', phase: 'reserved' },
      'technician',
    ),
  ).toBe(false)
  expect(canMarkNotPerformed(visit, 'store_supervisor')).toBe(false)
})
it('checklist queda readonly, libera recovery y lista el nuevo intento publicado sin inventar cronología', async () => {
  const { repos, visit } = await activeChecklist()
  const db = readDatabase()
  Object.assign(
    db.visits.find((item) => item.id === visit.id)!,
    { period: '2026-10-01', quota: 2, quotaCount: 3 },
  )
  writeDatabase(db)
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'Recorrido de inspección' })
  await confirm()
  await screen.findByRole('heading', { name: 'No realizado' })
  for (const name of [
    'Finalizar',
    'Enviar a revisión',
    'Terminar recorrido',
    'Marcar como no realizado',
  ])
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver obligaciones pendientes' })).toHaveAttribute(
    'href',
    '/checklists',
  )
  const old = await repos.visits.get(1)
  expect(old).toMatchObject({
    phase: 'not_performed',
    readOnly: true,
    occupiesTechnician: false,
    startedAt: visit.startedAt,
  })
  for (const field of [
    'physicalEndedAt',
    'formOpenedAt',
    'expiresAt',
    'submittedAt',
    'completedAt',
    'endLocation',
  ] as const)
    expect(old[field]).toBeUndefined()
  expect((await repos.visits.recovery()).activeExecution).toBeUndefined()
  const replacement = (await repos.checklists.list()).find(
    (item) => item.previousAttemptId === old.id,
  )!
  expect(replacement).toMatchObject({
    status: 'available',
    storeId: old.storeId,
    period: '2026-10-01',
    quota: 2,
    quotaCount: 3,
    tasks: old.tasks,
  })
  expect(replacement.id).not.toBe(old.id)
  expect(replacement.startedAt).toBeUndefined()
  await repos.checklists.claim(replacement.id)
  const store = await repos.stores.get(1)
  expect(
    (await repos.visits.start(replacement.id, { ...store, accuracy: 8, capturedAt: Date.now() }))
      .occupiesTechnician,
  ).toBe(true)
})
it('Corrección requerida conserva inicio, fin físico, plazo y envío previo al declarar No realizado', async () => {
  const { repos, visit } = await activeChecklist()
  await repos.visits.finishPhysicalWork(1)
  await repos.visits.openForm(1)
  const db = readDatabase()
  const stored = db.visits.find((item) => item.id === 1)!
  stored.status = 'correction_required'
  stored.submittedAt = new Date().toISOString()
  writeDatabase(db)
  const before = await repos.visits.get(1)
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'Corrección requerida' })
  await confirm()
  await screen.findByRole('heading', { name: 'No realizado' })
  const after = await repos.visits.get(1)
  for (const field of [
    'startedAt',
    'physicalEndedAt',
    'formOpenedAt',
    'expiresAt',
    'submittedAt',
    'endLocation',
  ] as const)
    expect(after[field]).toEqual(before[field])
  expect(after.startedAt).toBe(visit.startedAt)
  expect(after.completedAt).toBeUndefined()
})
it('atención iniciada queda readonly y el ticket real del double vuelve a programación con otro intento', async () => {
  const { repos, ticket, visitId } = await scheduledTicket()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  const store = await repos.stores.get(1)
  await repos.visits.start(visitId, { ...store, accuracy: 8, capturedAt: Date.now() })
  renderPage(<VisitEditor id={visitId} origin="ticket" />, repos)
  await screen.findByRole('heading', { name: 'Atención en curso' })
  await confirm()
  await screen.findByRole('heading', { name: 'No realizado' })
  expect(screen.queryByRole('button', { name: 'Terminar atención' })).not.toBeInTheDocument()
  expect((await repos.visits.recovery()).activeExecution).toBeUndefined()
  await repos.auth.login({ kind: 'demo', userId: 3 })
  const reopened = await repos.tickets.get(ticket.id)
  expect(reopened).toMatchObject({ status: 'open' })
  expect(reopened.technicianId).toBeUndefined()
  expect(reopened.scheduledAt).toBeUndefined()
  expect(reopened.resolvedAt).toBeUndefined()
  const rescheduled = await repos.tickets.schedule(
    ticket.id,
    1,
    new Date(Date.now() + 3600000).toISOString(),
    'Alta',
    '',
  )
  expect(rescheduled.visitId).not.toBe(visitId)
  expect((await repos.visits.get(visitId)).phase).toBe('not_performed')
})
it('NF puede confirmar antes de llegada y el detalle recarga el ticket reabierto desde API', async () => {
  const { repos, ticket, visitId } = await scheduledTicket()
  const request = vi.spyOn(repos.visits, 'markNotPerformed')
  renderPage(<TicketDetail id={ticket.id} account />, repos)
  await confirm()
  await screen.findByRole('heading', { name: 'No realizado' })
  await screen.findByRole('button', { name: 'Programar visita' })
  expect(request).toHaveBeenCalledExactlyOnceWith(
    visitId,
    'No fue posible acceder al equipo de la tienda.',
  )
  const old = await repos.visits.get(visitId)
  expect(old.startedAt).toBeUndefined()
  expect(old.physicalEndedAt).toBeUndefined()
  expect((await repos.tickets.get(ticket.id)).status).toBe('open')
})
