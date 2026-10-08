import { beforeEach, expect, it } from 'vitest'
import { createMockRepositories } from './repositories'
import { readDatabase, writeDatabase } from './storage'
import { createFixtures } from './fixtures'
import { operationalVisit } from './visitsRepository'
import { operationalVisitLabel } from '../../types/models'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

async function prepared() {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  const location = {
    latitude: store.latitude,
    longitude: store.longitude,
    accuracy: 8,
    capturedAt: Date.now(),
  }
  await repos.visits.start(1, location)
  await repos.visits.finishPhysicalWork(1)
  const opened = await repos.visits.openForm(1)
  await repos.checklists.saveDraft(1, {
    revision: opened.revision ?? 0,
    answers: opened.tasks.map((task) => ({
      taskId: task.id,
      result: 'no_aplica',
      observation: 'No corresponde a este equipo.',
      evidenceIds: [],
    })),
    workDescription: '',
    evidenceIds: [],
  })
  const expired = readDatabase()
  expired.visits.find((v) => v.id === 1)!.expiresAt = new Date(Date.now() - 1000).toISOString()
  writeDatabase(expired)
  const db = readDatabase()
  const stored = db.visits.find((v) => v.id === 1)!
  // Datos históricos anteriores a P0 para verificar correcciones independientes.
  stored.exceptions = ['arrival', 'closure', 'form'].map((scope, index) => ({
    id: index + 1,
    revision: 0,
    type: scope === 'form' ? 'time_limit' : 'location',
    scope: scope as 'arrival' | 'closure' | 'form',
    reason: 'Permiso o registro interrumpido (histórico).',
    failure: 'denied',
    telemetry:
      scope === 'form'
        ? undefined
        : {
            ...location,
            distanceMeters: 0,
            radiusMeters: 100,
            validated: false,
            failure: 'denied',
          },
  }))
  stored.status = 'correction_required'
  stored.submittedAt = new Date().toISOString()
  for (const exception of stored.exceptions) {
    exception.approved = true
    exception.decision = 'approved'
    exception.reviewReason = 'Decisión anterior de NF.'
    exception.reviewerId = 3
    exception.reviewedAt = new Date().toISOString()
  }
  writeDatabase(db)
  return { repos, location, before: await repos.visits.get(1) }
}

for (const scope of ['arrival', 'closure'] as const) {
  it(`${scope}: corregir motivo reabre únicamente esa excepción y conserva eventos físicos`, async () => {
    const { repos, before } = await prepared()
    const previous = before.exceptions!.find((e) => e.scope === scope)!
    const changed = await repos.visits.requestException(1, {
      type: 'location',
      scope,
      reason: previous.reason + ' Explicación corregida.',
      failure: previous.failure,
      revision: previous.revision,
    })
    const corrected = changed.exceptions!.find((e) => e.scope === scope)!
    expect(corrected.revision).toBe(previous.revision! + 1)
    expect(corrected.decision).toBe('pending')
    expect(corrected.approved).toBeUndefined()
    expect(corrected.telemetry).toEqual(previous.telemetry)
    expect(changed.exceptions!.filter((e) => e.scope !== scope)).toEqual(
      before.exceptions!.filter((e) => e.scope !== scope),
    )
    expect(
      changed.exceptionHistory!.findLast((e) => e.kind === 'exception_previous')?.exception,
    ).toEqual(previous)
    for (const key of [
      'startedAt',
      'physicalEndedAt',
      'formOpenedAt',
      'expiresAt',
      'submittedAt',
      'startLocation',
      'endLocation',
    ] as const)
      expect(changed[key]).toEqual(before[key])
    const persisted = readDatabase()
    const repeated = await repos.visits.requestException(1, {
      type: 'location',
      scope,
      reason: corrected.reason,
      failure: corrected.failure,
      revision: corrected.revision,
    })
    expect(repeated.exceptions).toEqual(changed.exceptions)
    expect(readDatabase().visits[0].exceptions).toEqual(persisted.visits[0].exceptions)
    expect(readDatabase().visits[0].exceptionHistory).toEqual(persisted.visits[0].exceptionHistory)
  })
  it(`${scope}: mismos datos no reabren aprobación ni incrementan revisión`, async () => {
    const { repos, before } = await prepared()
    const exception = before.exceptions!.find((e) => e.scope === scope)!
    const stored = readDatabase()
    const result = await repos.visits.requestException(1, {
      type: 'location',
      scope,
      reason: exception.reason,
      failure: exception.failure,
      revision: exception.revision,
    })
    expect(result.exceptions).toEqual(before.exceptions)
    expect(result.exceptionHistory).toEqual(before.exceptionHistory)
    expect(readDatabase().visits[0].exceptions).toEqual(stored.visits[0].exceptions)
    expect(readDatabase().visits[0].exceptionHistory).toEqual(stored.visits[0].exceptionHistory)
  })
}

for (const failure of ['revision', 'content', 'exception'] as const)
  it(`envío inválido por ${failure} revierte todas las correcciones y el envío`, async () => {
    const { repos } = await prepared()
    const db = readDatabase()
    const visit = db.visits.find((v) => v.id === 1)!
    if (failure === 'content') visit.answers = []
    writeDatabase(db)
    const before = readDatabase()
    const exceptions = visit.exceptions!.map((e) => ({
      type: e.type,
      scope: e.scope,
      failure: e.failure,
      reason: e.reason + ' Causa corregida.',
      revision: e.revision,
    }))
    if (failure === 'exception') exceptions[1].reason = 'corto'
    await expect(
      repos.visits.submitReview(1, {
        revision: (visit.revision ?? 0) + (failure === 'revision' ? 1 : 0),
        exceptions,
      }),
    ).rejects.toBeDefined()
    expect(readDatabase()).toEqual(before)
  })

it('saveDraft valida la revisión omitida como 0 y rechaza omisión después del primer guardado', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  await repos.checklists.claim(1)
  const store = await repos.stores.get(1)
  const location = { ...store, accuracy: 8, capturedAt: Date.now() }
  await repos.visits.start(1, location)
  await repos.visits.finishPhysicalWork(1)
  await repos.visits.openForm(1)
  const input = { answers: [], workDescription: '', evidenceIds: [] }
  expect((await repos.checklists.saveDraft(1, input)).revision).toBe(1)
  const before = readDatabase()
  await expect(repos.checklists.saveDraft(1, input)).rejects.toMatchObject({ code: 'conflict' })
  await expect(repos.checklists.saveDraft(1, { ...input, revision: 0 })).rejects.toMatchObject({
    code: 'conflict',
  })
  expect(readDatabase()).toEqual(before)
  expect((await repos.checklists.saveDraft(1, { ...input, revision: 1 })).revision).toBe(2)
})

for (const phase of ['physical_work', 'physical_finished', 'results'] as const)
  it(`legacy ${phase} permanece activo sin revisión enviada`, () => {
    const now = new Date().toISOString()
    const record = operationalVisit({
      ...createFixtures().visits[0],
      status: 'pending_approval',
      startedAt: now,
      physicalEndedAt: phase !== 'physical_work' ? now : undefined,
      formOpenedAt: phase === 'results' ? now : undefined,
      submittedAt: undefined,
    })
    expect(record.phase).toBe(phase)
    expect(record.occupiesTechnician).toBe(true)
    expect(record.readOnly).toBe(true)
    expect(operationalVisitLabel(record)).not.toBe('En revisión')
  })
