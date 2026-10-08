import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { renderPage } from '../test/render'
import { createMockRepositories } from '../test/doubles/repositories'
import { VisitEditor } from '../features/checklists/VisitEditor'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import { readDatabase, writeDatabase } from '../test/doubles/storage'
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
async function page() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  await repos.visits.start(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  await repos.visits.finishPhysicalWork(1)
  await repos.visits.openForm(1)
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByText('Finalizar')
  return repos
}
it('bloquea finalización sin resultados ni fotografías', async () => {
  await page()
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Resultado pendiente')
  expect(screen.getByRole('alert')).toHaveTextContent('Fotografía obligatoria')
})
it('sincroniza observaciones entre tareas y guarda el borrador', async () => {
  const repos = await page()
  fireEvent.click(screen.getAllByRole('button', { name: 'No conforme' })[0])
  expect(screen.getByRole('button', { name: 'Guardar observación' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Descripción obligatoria'), {
    target: { value: 'Filtro dañado' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar observación' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'No conforme' })[1])
  expect(screen.getByLabelText('Descripción obligatoria')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(async () =>
    expect((await repos.checklists.get(1)).answers[0]?.observation).toBe('Filtro dañado'),
  )
})

it('muestra tareas y termina sin GPS ni galería genérica durante el trabajo físico', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  await repos.visits.start(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'Recorrido de inspección' })
  const visit = await repos.visits.get(1)
  expect(visit.status).toBe('in_progress')
  expect(visit.formOpenedAt).toBeUndefined()
  expect(visit.expiresAt).toBeUndefined()
  for (const task of visit.tasks) expect(screen.getByText(task.title)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Tomar fotografía del recorrido' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '✓ Conforme' })).not.toBeInTheDocument()
  expect(
    screen.queryByRole('region', { name: 'Tiempo de registro del formulario' }),
  ).not.toBeInTheDocument()
  const getCurrentPosition = vi.fn((success: PositionCallback) =>
    success({
      coords: { latitude: store.latitude, longitude: store.longitude, accuracy: 8 },
      timestamp: Date.now(),
    } as GeolocationPosition),
  )
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Terminar recorrido' }))
  await screen.findByRole('heading', { name: 'Recorrido terminado' })
  expect(
    screen.queryByRole('region', { name: 'Tiempo de registro del formulario' }),
  ).not.toBeInTheDocument()
  expect((await repos.visits.get(1)).formOpenedAt).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Registrar resultados' }))
  await screen.findByLabelText('Reporte general del checklist')
  const opened = await repos.visits.get(1)
  expect(opened.expiresAt).toBeUndefined()
  expect(getCurrentPosition).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Reporte general del checklist')).toBeVisible()
})

it('cierre con GPS denegado registra fin físico sin abrir formulario', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  await repos.visits.start(1, { ...store, accuracy: 8, capturedAt: Date.now() })
  const open = vi.spyOn(repos.visits, 'openForm')
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((_success: PositionCallback, failure: PositionErrorCallback) =>
        failure({ code: 1 } as GeolocationPositionError),
      ),
    },
  })
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'Recorrido de inspección' })
  fireEvent.click(screen.getByRole('button', { name: 'Terminar recorrido' }))
  await screen.findByRole('heading', { name: 'Recorrido terminado' })
  const closed = await repos.visits.get(1)
  expect(closed.physicalEndedAt).toBeDefined()
  expect(closed.formOpenedAt).toBeUndefined()
  expect(closed.submittedAt).toBeUndefined()
  expect(closed.exceptions).toBeUndefined()
  expect(closed.endLocation).toBeUndefined()
  expect(open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Registrar resultados' }))
  await screen.findByLabelText('Reporte general del checklist')
  expect(open).toHaveBeenCalledWith(1)
})

it('envío normal usa cierre guardado y no obtiene GPS', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  const gps = { ...store, accuracy: 8, capturedAt: Date.now() }
  await repos.visits.start(1, gps)
  await repos.visits.finishPhysicalWork(1)
  const visit = await repos.visits.openForm(1)
  await repos.checklists.saveDraft(1, {
    revision: visit.revision,
    answers: visit.tasks.map((task) => ({
      taskId: task.id,
      result: 'no_aplica',
      observation: 'No corresponde a este equipo.',
      evidenceIds: [],
    })),
    workDescription: '',
    evidenceIds: [],
  })
  const requestGps = vi.fn()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: requestGps },
  })
  const complete = vi.spyOn(repos.visits, 'complete')
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('button', { name: 'Finalizar' })
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }))
  await screen.findByRole('button', { name: 'Confirmar envío' })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar envío' }))
  await screen.findByRole('dialog', { name: 'Trabajo finalizado' })
  expect(requestGps).not.toHaveBeenCalled()
  expect(complete.mock.calls[0]?.[1].revision).toBeTypeOf('number')
  expect(complete.mock.calls[0]?.[1].exceptions).toEqual([])
  expect(complete.mock.calls[0]?.[1]).not.toHaveProperty('location')
})

it('No aplica conserva un motivo previamente escrito al cambiar de resultado', async () => {
  await page()
  fireEvent.click(screen.getAllByRole('button', { name: 'No conforme' })[0])
  fireEvent.change(screen.getByLabelText('Descripción obligatoria'), {
    target: { value: 'No hay conexión a este tablero.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar observación' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'No aplica' })[0])
  expect(screen.getByLabelText('Descripción obligatoria')).toHaveValue(
    'No hay conexión a este tablero.',
  )
})

async function reviewedRecord(state: 'pending_approval' | 'correction_required') {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  const gps = { ...store, accuracy: 8, capturedAt: Date.now() }
  await repos.visits.start(1, gps)
  await repos.visits.finishPhysicalWork(1)
  const opened = await repos.visits.openForm(1)
  const db = readDatabase()
  const visit = db.visits.find((v) => v.id === 1)!
  visit.status = state
  visit.submittedAt = new Date().toISOString()
  visit.answers = visit.tasks.map((task) => ({
    taskId: task.id,
    result: 'no_aplica',
    observation: 'No corresponde a este equipo.',
    evidenceIds: [],
  }))
  visit.exceptions = [
    {
      id: 1,
      revision: 1,
      type: 'location',
      scope: 'arrival',
      reason: 'GPS rechazado al registrar llegada.',
      failure: 'denied',
      approved: true,
      requestedAt: visit.startedAt,
      reviewReason: 'Llegada aprobada por NF.',
    },
    {
      id: 2,
      revision: 3,
      type: 'location',
      scope: 'closure',
      reason: 'GPS rechazado al registrar cierre.',
      failure: 'denied',
      approved: state === 'correction_required' ? false : undefined,
      requestedAt: visit.physicalEndedAt,
      reviewReason: 'Explica mejor la causa del cierre.',
    },
  ]
  writeDatabase(db)
  return { repos, opened }
}
it('En revisión es readonly y no ofrece edición ni otro GPS', async () => {
  const { repos } = await reviewedRecord('pending_approval')
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'En revisión' })
  expect(screen.queryByRole('button', { name: 'No aplica' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Terminar recorrido' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Terminar atención' })).not.toBeInTheDocument()
  expect(screen.getByText('Puedes comenzar otro trabajo.')).toBeVisible()
  expect((await repos.visits.get(1)).occupiesTechnician).toBe(false)
})
it('legacy pendiente sin envío continúa en resultados y sigue ocupando al técnico', async () => {
  const { repos } = await reviewedRecord('pending_approval')
  const db = readDatabase()
  const stored = db.visits.find((v) => v.id === 1)!
  stored.submittedAt = undefined
  writeDatabase(db)
  const legacy = await repos.visits.get(1)
  expect(legacy.phase).toBe('results')
  expect(legacy.occupiesTechnician).toBe(true)
  expect(legacy.readOnly).toBe(true)
  const recovery = await repos.visits.recovery()
  expect(recovery.activeExecution?.id).toBe(1)
  expect(recovery.inReview).toEqual([])
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'Registro de resultados' })
  expect(screen.queryByRole('heading', { name: 'En revisión' })).not.toBeInTheDocument()
  expect(screen.getByText('Esta ejecución sigue ocupando al técnico.')).toBeVisible()
  expect(screen.queryByText('Puedes comenzar otro trabajo.')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})
it('resultados legacy respeta permiso de edición explícito de la API', async () => {
  const { repos } = await reviewedRecord('pending_approval')
  const legacy = await repos.visits.get(1)
  vi.spyOn(repos.checklists, 'get').mockResolvedValue({
    ...legacy,
    phase: 'results',
    submittedAt: undefined,
    occupiesTechnician: true,
    readOnly: false,
  })
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByLabelText('Reporte general del checklist')
  expect(screen.queryByRole('heading', { name: 'En revisión' })).not.toBeInTheDocument()
  expect(screen.queryByText('Puedes comenzar otro trabajo.')).not.toBeInTheDocument()
})
it('corrección de cierre conserva arrival aprobado, timestamps y envío anterior hasta reenviar', async () => {
  const { repos, opened } = await reviewedRecord('correction_required')
  const submittedAt = (await repos.visits.get(1)).submittedAt
  const submit = vi.spyOn(repos.visits, 'submitReview')
  renderPage(<VisitEditor id={1} origin="checklist" />, repos)
  await screen.findByRole('heading', { name: 'Corrección requerida' })
  expect(screen.queryByLabelText('Justificación GPS de llegada')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Reporte general del checklist'), {
    target: { value: 'Descripción técnica corregida.' },
  })
  await waitFor(async () =>
    expect((await repos.visits.get(1)).workDescription).toBe('Descripción técnica corregida.'),
  )
  expect((await repos.visits.get(1)).exceptions?.[0].approved).toBe(true)
  expect((await repos.visits.get(1)).submittedAt).toBe(submittedAt)
  fireEvent.change(screen.getByLabelText('Justificación GPS de cierre'), {
    target: { value: 'El permiso de ubicación siguió denegado al terminar.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar a revisión' }))
  await screen.findByRole('button', { name: 'Confirmar envío' })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar envío' }))
  await screen.findByRole('heading', { name: 'En revisión' })
  const input = submit.mock.calls[0][1]
  expect(input).not.toHaveProperty('location')
  expect(input.exceptions.map((item) => item.scope)).toEqual(['arrival', 'closure'])
  expect(input.exceptions[0].reason).toBe('GPS rechazado al registrar llegada.')
  expect(input.exceptions[1].reason).toBe('El permiso de ubicación siguió denegado al terminar.')
  const result = await repos.visits.get(1)
  expect(result.exceptions?.find((e) => e.scope === 'arrival')?.approved).toBe(true)
  expect(result.exceptions?.find((e) => e.scope === 'arrival')?.revision).toBe(1)
  expect(result.exceptions?.find((e) => e.scope === 'closure')?.revision).toBe(4)
  expect(result.startedAt).toBe(opened.startedAt)
  expect(result.physicalEndedAt).toBe(opened.physicalEndedAt)
  expect(result.formOpenedAt).toBe(opened.formOpenedAt)
  expect(result.expiresAt).toBe(opened.expiresAt)
})
