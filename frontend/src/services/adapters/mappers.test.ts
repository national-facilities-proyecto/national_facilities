import { expect, it } from 'vitest'
import { registrationEditable } from '../../types/models'
import {
  mapUser,
  mapStore,
  mapVisit,
  mapTicket,
  mapContract,
  mapTemplate,
  mapClient,
  mapEvidence,
  mapCatalogs,
  mapDashboard,
  rows,
} from './mappers'

const started = '2026-10-01T10:00:00-05:00'
const opened = '2026-10-01T10:08:00-05:00'
const deadline = '2026-10-01T10:13:00-05:00'
const task = { id: 1, title: 'Revisar tablero', active: true, photoRequired: true, order: 0 }
const user = {
  id: 1,
  username: 'field',
  name: 'Técnico',
  email: 'field@test.invalid',
  role: 'technician',
  active: true,
  passwordInitialized: true,
  storeIds: [2],
}
const visit = {
  id: 3,
  storeId: 2,
  technicianId: 1,
  ticketId: null,
  origin: 'checklist',
  scheduledAt: started,
  status: 'in_progress',
  phase: 'results',
  occupiesTechnician: true,
  readOnly: false,
  gpsExceptionPending: false,
  physicalEndedAt: opened,
  workStatus: 'in_progress',
  tasks: [task],
  answers: [{ taskId: 1, result: 'no_aplica', observation: '', evidenceIds: ['file'] }],
  workDescription: '',
  evidenceIds: [],
  startLocation: { latitude: -12, longitude: -77, accuracy: 8, capturedAt: 1 },
  endLocation: null,
  startedAt: started,
  formOpenedAt: opened,
  expiresAt: deadline,
  submittedAt: null,
  completedAt: null,
  revision: 4,
  serverNow: opened,
  timeLimitSeconds: 300,
  timeLimitExceeded: false,
  exceptions: [],
  exceptionHistory: [],
  claimedAt: null,
  claimExpiresAt: null,
  claimHistory: [],
  exception: null,
  radiusMeters: 100,
  legacy: false,
  totalSeconds: null,
  executionSeconds: 480,
  registrationSeconds: null,
}

it('valida el indicador por tienda, sin aceptar mínimos o conteos incoherentes', () => {
  const metric = {
    storeId: 2,
    store: 'Tienda',
    clientId: 1,
    client: 'Cliente',
    completed: 1,
    required: 2,
    missing: 1,
  }
  const raw = {
    period: '2026-10-01',
    clients: [{ id: 1, name: 'Cliente' }],
    compliance: 100,
    pendingVisits: 0,
    pendingExceptions: 1,
    averageHours: null,
    ticketsByStatus: {
      open: 0,
      scheduled: 1,
      in_progress: 0,
      pending_approval: 1,
      correction_required: 0,
      resolved: 1,
      closed: 0,
    },
    risks: [metric],
  }
  expect(mapDashboard(raw).risks[0]).toEqual(metric)
  expect(mapDashboard({ ...raw, compliance: null, averageHours: 2 }).averageHours).toBe(2)
  expect(() => mapDashboard({ ...raw, risks: [{ ...metric, required: 1 }] })).toThrow()
  expect(() => mapDashboard({ ...raw, risks: [{ ...metric, missing: 0 }] })).toThrow()
  expect(() => mapDashboard({ ...raw, risks: [{ ...metric, storeId: -1 }] })).toThrow()
  expect(() => mapDashboard({ ...raw, pendingVisits: -1 })).toThrow()
  expect(() => mapDashboard({ ...raw, compliance: 101 })).toThrow()
  expect(() => mapDashboard({ ...raw, averageHours: -1 })).toThrow()
})

it('valida identidad, roles y coordenadas decimales sin casts de compatibilidad', () => {
  expect(mapUser(user).storeIds).toEqual([2])
  for (const role of [null, 'superuser', 3]) expect(() => mapUser({ ...user, role })).toThrow()
  const store = {
    id: 2,
    name: 'Tienda',
    address: 'Dirección',
    latitude: '-12.123000',
    longitude: '-77.100000',
    clientId: 1,
    contact: '',
    active: true,
  }
  expect(mapStore(store).latitude).toBe(-12.123)
  expect(mapStore({ ...store, latitude: -12, longitude: -77 }).longitude).toBe(-77)
  for (const latitude of ['NaN', 91, Infinity])
    expect(() => mapStore({ ...store, latitude })).toThrow()
  expect(() => rows({ results: [] })).toThrow()
  expect(() => mapUser({ ...user, id: -1 })).toThrow()
})
it('recupera las dos etapas, revisión, resultados y timestamps originales', () => {
  const recovered = mapVisit(visit)
  expect(recovered.answers[0].result).toBe('no_aplica')
  expect(recovered.expiresAt).toBe(deadline)
  expect(recovered.revision).toBe(4)
  expect(recovered.executionSeconds).toBe(480)
  const monthly = mapVisit({ ...visit, quota: 2, quotaCount: 3, period: '2026-10-01' })
  expect(monthly.quota).toBe(2)
  expect(monthly.quotaCount).toBe(3)
  expect(() => mapVisit({ ...visit, quota: 4, quotaCount: 3 })).toThrow()
  expect(() => mapVisit({ ...visit, quota: 0, quotaCount: 3 })).toThrow()
  const storeSnapshot = {
    name: 'Nombre histórico',
    address: 'Dirección histórica',
    latitude: -12,
    longitude: -77,
    clientId: 1,
  }
  expect(mapVisit({ ...visit, storeSnapshot }).storeSnapshot).toEqual(storeSnapshot)
  expect(() => mapVisit({ ...visit, storeSnapshot: { ...storeSnapshot, latitude: 95 } })).toThrow()
  const exception = {
    id: 5,
    revision: 0,
    type: 'time_limit',
    reason: 'Dispositivo apagado',
    failure: '',
    requestedAt: deadline,
    approved: false,
    reviewReason: 'Revisado por supervisor',
    reviewerId: 2,
    reviewedAt: deadline,
  }
  expect(mapVisit({ ...visit, exceptions: [exception], exception }).exceptions?.[0].approved).toBe(
    false,
  )
  expect(
    mapVisit({
      ...visit,
      startLocation: null,
      formOpenedAt: null,
      expiresAt: null,
      timeLimitSeconds: null,
    }).expiresAt,
  ).toBeUndefined()
  expect(mapVisit({ ...visit, legacy: true, radiusMeters: null }).radiusMeters).toBeUndefined()
  for (const patch of [
    { radiusMeters: null },
    { status: 'invented' },
    { serverNow: 'invalid' },
    { startLocation: { ...visit.startLocation, accuracy: -1 } },
    { startLocation: { ...visit.startLocation, longitude: 190 } },
  ])
    expect(() => mapVisit({ ...visit, ...patch })).toThrow()
})

it('recupera reservas de dos horas y su liberación automática con autor de sistema', () => {
  const expires = '2026-10-01T12:00:00-05:00'
  const entry = {
    id: '9',
    at: expires,
    actorId: null,
    kind: 'claim_release',
    technicianId: 1,
    claimedAt: started,
    expiresAt: expires,
    text: 'Reserva liberada automáticamente',
  }
  const recovered = mapVisit({
    ...visit,
    claimedAt: started,
    claimExpiresAt: expires,
    claimHistory: [entry],
  })
  expect(recovered.claimExpiresAt).toBe(expires)
  expect(recovered.claimHistory?.[0].actorId).toBeUndefined()
  expect(recovered.claimHistory?.[0].technicianId).toBe(1)
  expect(() => mapVisit({ ...visit, claimedAt: started })).toThrow()
  expect(() => mapVisit({ ...visit, claimedAt: started, claimExpiresAt: deadline })).toThrow()
  expect(() => mapVisit({ ...visit, claimHistory: [{ ...entry, kind: 'claim' }] })).toThrow()
  expect(() => mapVisit({ ...visit, claimHistory: [{ ...entry, technicianId: -1 }] })).toThrow()
})
it('separa descripción original, resolución y archivos técnicos del ticket', () => {
  const ticket = {
    id: 7,
    storeId: 2,
    reporterId: 4,
    category: 'Nueva especialidad',
    categoryId: 20,
    priority: 'Urgente',
    priorityId: 30,
    description: 'Reporte original',
    status: 'resolved',
    workStatus: 'finished',
    createdAt: started,
    technicianId: 1,
    scheduledAt: started,
    resolvedAt: deadline,
    resolution: 'Trabajo realizado',
    evidenceIds: ['original'],
    technicalEvidenceIds: ['technical'],
    visitId: 3,
    revision: 2,
    history: [{ id: '10', at: started, actorId: 2, text: 'Reasignación registrada' }],
  }
  expect(mapTicket(ticket).technicalEvidenceIds).toEqual(['technical'])
  const data = {
    reason: 'Disponibilidad modificada',
    previous: { technicianId: 1, scheduledAt: started, priorityId: 30 },
    next: { technicianId: 2, scheduledAt: deadline, priorityId: 30 },
  }
  const changed = mapTicket({ ...ticket, history: [{ ...ticket.history[0], data }] }).history[0]
  expect(changed.reason).toBe(data.reason)
  expect(changed.previous?.technicianId).toBe(1)
  expect(changed.next?.scheduledAt).toBe(deadline)
  expect(() =>
    mapTicket({
      ...ticket,
      history: [{ ...ticket.history[0], data: { ...data, next: { priorityId: '30' } } }],
    }),
  ).toThrow()
  expect(
    mapTicket({ ...ticket, visitId: null, technicianId: null, scheduledAt: null, resolvedAt: null })
      .visitId,
  ).toBeUndefined()
  expect(() => mapTicket({ ...ticket, categoryId: '20' })).toThrow()
  expect(() => mapTicket({ ...ticket, workStatus: 'pending' })).toThrow()
})
it('recupera correcciones tras rechazo y rechaza estados operativos incompatibles', () => {
  const rejected = {
    id: 4,
    revision: 1,
    type: 'time_limit',
    reason: 'Falló la conexión durante la carga',
    failure: '',
    authorId: 1,
    requestedAt: deadline,
    approved: false,
    reviewReason: 'Precisa la observación técnica',
    reviewerId: 2,
    reviewedAt: deadline,
  }
  const record = mapVisit({
    ...visit,
    status: 'correction_required',
    phase: 'correction_required',
    workStatus: 'correction_required',
    submittedAt: deadline,
    exceptions: [rejected],
    exception: rejected,
    exceptionHistory: [{ id: '5', kind: 'review', actorId: 2, at: deadline, exception: rejected }],
  })
  expect(registrationEditable(record)).toBe(true)
  expect(record.exceptionHistory?.[0].exception.reviewReason).toBe(rejected.reviewReason)
  expect(
    registrationEditable({
      ...record,
      status: 'pending_approval',
      readOnly: true,
      phase: 'in_review',
      exceptions: [{ ...record.exceptions![0], approved: undefined }],
    }),
  ).toBe(false)
  expect(
    registrationEditable({
      ...record,
      status: 'pending_approval',
      readOnly: true,
      submittedAt: undefined,
    }),
  ).toBe(false)
  expect(() => mapVisit({ ...visit, workStatus: 'finished' })).toThrow()
  expect(() => mapVisit({ ...visit, status: 'form_expired', workStatus: 'in_review' })).toThrow()
})
it('conserva metadatos históricos nulos y no inventa una fecha de captura', () => {
  const evidence = {
    id: 'uuid',
    taskId: null,
    visitId: 3,
    ticketId: null,
    name: 'evidence.jpg',
    mimeType: 'image/jpeg',
    size: 120,
    capturedAt: null,
    uploadedAt: opened,
    source: 'gallery',
  }
  expect(mapEvidence(evidence).capturedAt).toBeUndefined()
  expect(mapEvidence(evidence).uploadedAt).toBe(opened)
  expect(mapEvidence({ ...evidence, mimeType: '', size: 0 }).size).toBe(0)
  expect(mapEvidence({ ...evidence, capturedAt: started, source: 'camera' }).capturedAt).toBe(
    started,
  )
})
it('mapea administración y catálogos por sus IDs reales', () => {
  const client = { id: 1, name: 'Cliente', taxId: '1', email: '' }
  expect(mapClient(client)).toEqual(client)
  expect(() => mapClient({ ...client, name: null })).toThrow()
  const contract = {
    id: 1,
    clientId: 1,
    templateId: 2,
    startDate: '2026-10-01',
    endDate: null,
    monthlyVisits: 1,
    monthlyInterventions: 2,
    radiusMeters: 100,
    active: true,
  }
  expect(mapContract(contract).endDate).toBe('')
  expect(() => mapContract({ ...contract, monthlyInterventions: 1 })).toThrow()
  expect(mapContract({ ...contract, endDate: '2026-11-01' }).endDate).toBe('2026-11-01')
  expect(
    mapTemplate({ id: 2, name: 'Plantilla', version: 1, active: true, tasks: [task] }).tasks[0]
      .order,
  ).toBe(0)
  expect(
    mapCatalogs({
      categories: [{ id: 20, name: 'Nueva especialidad' }],
      priorities: [{ id: 30, name: 'Urgente', firstResponseHours: 2, resolutionHours: 24 }],
    }).categories[0].id,
  ).toBe(20)
  for (const invalid of [null, [], 'text']) expect(() => mapUser(invalid)).toThrow()
})

it('mapea fases V2 y telemetría ausente sin fabricar coordenadas', () => {
  for (const phase of [
    'available',
    'reserved',
    'scheduled',
    'physical_work',
    'physical_finished',
    'results',
    'in_review',
    'correction_required',
    'finished',
    'not_performed',
  ])
    expect(mapVisit({ ...visit, phase }).phase).toBe(phase)
  const telemetry = {
    latitude: null,
    longitude: null,
    accuracy: null,
    capturedAt: null,
    distanceMeters: null,
    radiusMeters: 100,
    failure: 'denied',
    validated: false,
  }
  const arrival = {
    id: 11,
    revision: 1,
    type: 'location',
    scope: 'arrival',
    reason: 'Permiso denegado.',
    failure: 'denied',
    telemetry,
    requestedAt: started,
    approved: true,
  }
  const closure = { ...arrival, id: 12, scope: 'closure', failure: 'timeout', approved: null }
  const result = mapVisit({
    ...visit,
    phase: 'physical_work',
    formOpenedAt: null,
    physicalEndedAt: null,
    expiresAt: null,
    gpsExceptionPending: true,
    startLocation: telemetry,
    exceptions: [arrival, closure],
    exceptionHistory: [
      { id: '3', at: opened, actorId: 1, kind: 'exception_previous', exception: arrival },
    ],
  })
  expect(result.exceptions?.map((e) => e.scope)).toEqual(['arrival', 'closure'])
  expect(result.exceptions?.map((e) => e.decision)).toEqual(['approved', 'pending'])
  expect(result.exceptions?.[0].telemetry?.latitude).toBeNull()
  expect(result.startLocation?.latitude).toBeUndefined()
  expect(result.formOpenedAt).toBeUndefined()
  expect(result.physicalEndedAt).toBeUndefined()
  expect(
    mapVisit({ ...visit, previousAttemptId: 2, notPerformedAt: deadline }).previousAttemptId,
  ).toBe(2)
  expect(() => mapVisit({ ...visit, phase: 'invented' })).toThrow()
})
it('GPS legacy conserva etapa desconocida y precisión no registrada', () => {
  const raw = {
    type: 'location',
    scope: 'legacy',
    reason: 'Registro antiguo',
    failure: '',
    requestedAt: null,
    approved: null,
    reviewReason: null,
  }
  const result = mapVisit({
    ...visit,
    exception: raw,
    startLocation: {
      latitude: -12,
      longitude: -77,
      accuracy: null,
      capturedAt: null,
      validated: null,
      legacy: true,
    },
  })
  expect(result.exception?.scope).toBe('legacy')
  expect(result.exception?.requestedAt).toBeUndefined()
  expect(result.startLocation?.accuracy).toBeUndefined()
})
