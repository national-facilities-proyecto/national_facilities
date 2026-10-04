import { test, expect } from '@playwright/test'
import {
  access,
  api,
  login,
  call,
  visit,
  mapVisit,
  mapTicket,
  object,
  advance,
  upload,
  checklistCase,
  jpeg,
  string,
} from './helpers.js'

test('checklist: dos etapas, borrador, fotos, recarga, segunda sesión y finalización reales', async ({
  page,
  request,
  browser,
}) => {
  const token = await access(request, 'tech')
  const caseId = checklistCase()
  await call(request, '/checklists/generar/', token, {})
  const raw = await call(request, '/checklists/', token)
  const visits: unknown[] = Array.isArray(raw) ? raw : []
  const available = visits.map(mapVisit).find((v) => v.id === caseId && v.status === 'available')
  expect(available).toBeDefined()
  if (!available) throw new Error('No existe checklist de prueba disponible.')
  await login(page)
  await page.goto('/checklists/' + available.id)
  await page.getByRole('button', { name: 'Obtener ubicación', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar checklist', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Trabajo en ejecución' })).toBeVisible()
  await expect(page.getByText('Inspect test device', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '✓ Conforme', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Tiempo de registro del formulario' })).toHaveCount(
    0,
  )
  let uploads = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/evidencias/')) uploads++
  })
  await page.getByRole('button', { name: 'Tomar fotografía del recorrido', exact: true }).click()
  const camera = page.getByRole('dialog', { name: 'Tomar fotografía', exact: true })
  await camera.getByRole('button', { name: 'Capturar', exact: true }).click()
  await camera.getByRole('button', { name: 'Confirmar foto', exact: true }).click()
  await expect(camera).toHaveCount(0)
  await expect(page.locator('.nf-evidence img')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.nf-evidence img')).toHaveCount(1)
  expect(uploads).toBe(0)
  let current = await visit(request, available.id, token)
  expect(current.formOpenedAt).toBeUndefined()
  expect(current.expiresAt).toBeUndefined()
  advance(available.id, 'work')
  await page.reload()
  await expect(page.getByText(/Tiempo transcurrido: 8 min/)).toBeVisible()
  await page.getByRole('button', { name: 'Finalizar checklist', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Finalizar checklist', exact: true })).toBeVisible()
  current = await visit(request, available.id, token)
  const deadline = current.expiresAt
  expect(Date.parse(deadline ?? '') - Date.parse(current.formOpenedAt ?? '')).toBe(300000)
  await page.getByRole('button', { name: '✓ Conforme', exact: true }).click()
  await page
    .getByLabel('Ítem para fotografía 1', { exact: true })
    .selectOption({ label: 'Inspect test device' })
  await page.getByRole('button', { name: 'Asociar fotografía', exact: true }).click()
  await expect(
    page.getByText('No hay fotografías pendientes de asociación.', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('fieldset .nf-evidence img')).toHaveCount(1)
  expect(uploads).toBe(1)
  const recorded = object(await call(request, `/visitas/${available.id}/`, token))
  const answers = Array.isArray(recorded.answers) ? recorded.answers.map(object) : []
  const evidence = await request.get(
    `${api}/evidencias/${String((answers[0]?.evidenceIds as string[])[0])}/`,
    { headers: { Authorization: 'Bearer ' + token } },
  )
  expect(evidence.ok()).toBe(true)
  expect(Date.parse(String(object(await evidence.json()).capturedAt))).toBeLessThan(
    Date.parse(current.formOpenedAt ?? ''),
  )
  await page
    .getByLabel('Reporte general del checklist')
    .fill('Preventive review completed during the physical walkthrough.')
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Reporte general del checklist')).toHaveValue(
    'Preventive review completed during the physical walkthrough.',
  )
  await expect(page.getByRole('button', { name: '✓ Conforme', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.nf-evidence img')).toHaveCount(1)
  expect((await visit(request, available.id, token)).expiresAt).toBe(deadline)
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: -12.1739, longitude: -77.0181, accuracy: 8 },
  })
  const another = await context.newPage()
  await login(another)
  await another.goto('/checklists/' + available.id + '/start')
  await expect(another.locator('.nf-evidence img')).toHaveCount(1)
  expect((await visit(request, available.id, token)).expiresAt).toBe(deadline)
  await context.close()
  await page.getByRole('button', { name: 'Finalizar checklist', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar finalización', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Trabajo finalizado' })).toBeVisible()
  expect((await visit(request, available.id, token)).status).toBe('completed')
})

test('reserva de checklist: liberación a las dos horas, pantalla antigua y nuevo técnico', async ({
  page,
  request,
  browser,
}) => {
  const id = checklistCase()
  const token = await access(request, 'tech')
  await login(page)
  await page.goto(`/checklists/${id}`)
  await page.getByRole('button', { name: 'Reservar checklist', exact: true }).click()
  await expect(page.getByText(/Reserva hasta/)).toBeVisible()
  const original = object(await call(request, `/visitas/${id}/`, token))
  expect(Date.parse(String(original.claimExpiresAt)) - Date.parse(String(original.claimedAt))).toBe(
    7200000,
  )
  advance(id, 'expire_claim')
  await page.getByRole('button', { name: 'Obtener ubicación', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar checklist', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Actualizar visita', exact: true })).toBeVisible()
  const released = object(await call(request, `/visitas/${id}/`, token))
  expect(released.status).toBe('available')
  expect(released.technicianId).toBeNull()
  expect(released.startedAt).toBeNull()
  expect(released.expiresAt).toBeNull()
  const history = Array.isArray(released.claimHistory) ? released.claimHistory.map(object) : []
  expect(history.filter((item) => item.kind === 'claim_release')).toHaveLength(1)
  expect(history.find((item) => item.kind === 'claim_release')?.actorId).toBeNull()
  const otherToken = await access(request, 'othertech')
  await call(request, `/visitas/pool/${id}/tomar/`, otherToken, {})
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: -12.1739, longitude: -77.0181, accuracy: 8 },
  })
  const other = await context.newPage()
  await login(other, 'othertech')
  await other.goto(`/checklists/${id}`)
  await expect(
    other.getByRole('heading', { name: 'Historial de reservas', exact: true }),
  ).toBeVisible()
  await other.getByRole('button', { name: 'Obtener ubicación', exact: true }).click()
  await other.getByRole('button', { name: 'Iniciar checklist', exact: true }).click()
  await expect(
    other.getByRole('heading', { name: 'Trabajo en ejecución', exact: true }),
  ).toBeVisible()
  const active = object(await call(request, `/visitas/${id}/`, otherToken))
  expect(active.formOpenedAt).toBeNull()
  expect(active.expiresAt).toBeNull()
  await page.getByRole('button', { name: 'Actualizar visita', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Iniciar checklist', exact: true })).toHaveCount(0)
  const oldAccess = await request.get(`${api}/visitas/${id}/`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  expect(oldAccess.status()).toBe(404)
  await context.close()
})

test('ticket: reporte, programación, reasignación, atención y resolución entre usuarios', async ({
  page,
  request,
  context,
  browser,
}) => {
  await login(page, 'store')
  await page.goto('/supervisor/tickets/new')
  await page.getByLabel('Especialidad', { exact: true }).selectOption({ label: 'Eléctrico' })
  await page.getByLabel('Prioridad', { exact: true }).selectOption({ label: 'Alta' })
  await page
    .getByLabel('Descripción del problema')
    .fill('Electrical cabinet requires a component replacement.')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Seleccionar fotografías', exact: true }).click()
  await page
    .getByLabel('Fotografías del reporte', { exact: true })
    .setInputFiles({ name: 'original.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  await expect(page.getByRole('button', { name: 'Reintentar carga', exact: true })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Reintentar carga', exact: true }).click()
  await expect(page.locator('.nf-evidence img')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.nf-evidence img')).toHaveCount(1)
  await page.getByLabel('Especialidad', { exact: true }).selectOption({ label: 'Eléctrico' })
  await page.getByLabel('Prioridad', { exact: true }).selectOption({ label: 'Alta' })
  await page
    .getByLabel('Descripción del problema')
    .fill('Electrical cabinet requires a component replacement.')
  await page.getByRole('button', { name: 'Enviar reporte', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Ticket #/ })).toBeVisible()
  const id = Number(page.url().split('/').at(-1))
  await page.context().clearCookies()
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/login')
  await login(page, 'account')
  await page.goto('/technical-supervisor/incidents/' + id)
  const accountToken = await access(request, 'account')
  const rawUsers = await call(request, '/usuarios/', accountToken)
  const users: unknown[] = Array.isArray(rawUsers) ? rawUsers : []
  const tech = users.map(object).find((u) => u.username === 'tech')
  const other = users.map(object).find((u) => u.username === 'othertech')
  await page.getByLabel('Técnico asignado', { exact: true }).selectOption(String(other?.id))
  const future = new Date(Date.now() + 3600000)
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
  await page.getByLabel('Fecha y hora de visita').fill(local)
  await page.getByRole('button', { name: 'Programar visita', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Guardar reprogramación', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Técnico asignado', { exact: true }).selectOption(String(tech?.id))
  await page
    .getByLabel('Motivo de reprogramación o reasignación')
    .fill('Changed technician availability for this assignment.')
  await page.getByRole('button', { name: 'Guardar reprogramación', exact: true }).click()
  await expect(
    page
      .locator('.nf-timeline li')
      .filter({ hasText: 'Ticket reprogramado / reasignado' })
      .getByText('Motivo: Changed technician availability for this assignment.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Ticket reprogramado / reasignado', { exact: true })).toBeVisible()
  const ticket = mapTicket(await call(request, '/tickets/' + id + '/', accountToken))
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/login')
  await login(page)
  await page.goto('/routes/' + ticket.visitId)
  await page.getByRole('button', { name: 'Obtener ubicación', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar inicio', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Trabajo en ejecución' })).toBeVisible()
  const supervisorContext = await browser.newContext()
  const supervisor = await supervisorContext.newPage()
  await login(supervisor, 'account')
  await supervisor.goto('/technical-supervisor/incidents/' + id)
  await expect(
    supervisor.getByText('Solo se puede cambiar de técnico mientras el ticket esté Pendiente.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(supervisor.getByLabel('Técnico asignado', { exact: true })).toHaveCount(0)
  await supervisorContext.close()
  if (!ticket.visitId) throw new Error('Sin visita programada.')
  advance(ticket.visitId, 'work')
  await page.reload()
  await page.getByRole('button', { name: 'Registrar resolución', exact: true }).click()
  await page
    .getByLabel('Descripción del trabajo realizado')
    .fill('Replaced the component and checked the cabinet safely.')
  await upload(page)
  await page.reload()
  await expect(page.getByLabel('Descripción del trabajo realizado')).toHaveValue(
    'Replaced the component and checked the cabinet safely.',
  )
  await page.getByRole('button', { name: 'Finalizar ticket', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar finalización', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Trabajo finalizado' })).toBeVisible()
  expect(mapTicket(await call(request, '/tickets/' + id + '/', accountToken)).status).toBe(
    'resolved',
  )
  const resolved = object(await call(request, '/tickets/' + id + '/', accountToken))
  expect(Array.isArray(resolved.evidenceIds) && resolved.evidenceIds.length).toBe(1)
  expect(Array.isArray(resolved.technicalEvidenceIds) && resolved.technicalEvidenceIds.length).toBe(
    1,
  )
  expect(resolved.evidenceIds).not.toEqual(resolved.technicalEvidenceIds)
})

test('indicador real: dos tickets por tienda, checklist separado y contrato duplicado rechazado', async ({
  page,
  request,
  browser,
}) => {
  const caseId = checklistCase()
  const otherCaseId = checklistCase()
  const techToken = await access(request, 'tech')
  const accountToken = await access(request, 'account')
  const firstVisit = object(await call(request, `/visitas/${caseId}/`, techToken))
  const otherVisit = object(await call(request, `/visitas/${otherCaseId}/`, techToken))
  const storeId = Number(firstVisit.storeId)
  const otherStoreId = Number(otherVisit.storeId)
  const rawStore = object(await call(request, `/tiendas/${storeId}/`, accountToken))
  const rawOtherStore = object(await call(request, `/tiendas/${otherStoreId}/`, accountToken))
  const catalogs = object(await call(request, '/catalogos/', accountToken))
  const categories = Array.isArray(catalogs.categories) ? catalogs.categories.map(object) : []
  const priorities = Array.isArray(catalogs.priorities) ? catalogs.priorities.map(object) : []
  const adminToken = await access(request, 'admin')
  const rawUsers = await call(request, '/admin/usuarios/', adminToken)
  const users = Array.isArray(rawUsers) ? rawUsers.map(object) : []
  const reporter = await call(request, '/admin/usuarios/', adminToken, {
    username: 'monthly-store-' + crypto.randomUUID().slice(0, 8),
    name: 'Monthly test reporter',
    email: 'monthly@test.invalid',
    password: 'Field-test-secure-2026!',
    role: 'store_supervisor',
    active: true,
    storeIds: [storeId],
  })
  const reporterName = string(object(reporter).username)
  // Primer cambio obligatorio y luego todos los reportes usan el usuario real autorizado.
  const reporterContext = await browser.newContext()
  const reportPage = await reporterContext.newPage()
  await login(reportPage, reporterName)
  await reportPage
    .getByLabel('Nueva contraseña', { exact: true })
    .fill('Monthly-test-new-secure-2026!')
  await reportPage
    .getByLabel('Confirmar contraseña', { exact: true })
    .fill('Monthly-test-new-secure-2026!')
  await reportPage.getByRole('button', { name: 'Guardar contraseña', exact: true }).click()
  await expect(
    reportPage.getByText('Cambio registrado correctamente.', { exact: false }),
  ).toBeVisible()
  await reportPage.goto('/supervisor/tickets')
  await expect(
    reportPage.getByRole('heading', { name: 'Mis incidencias', exact: true }),
  ).toBeVisible()
  const loginResponse = await request.post(api + '/auth/login/', {
    data: { username: reporterName, password: 'Monthly-test-new-secure-2026!' },
  })
  expect(loginResponse.ok()).toBe(true)
  const reporterSession = object(await loginResponse.json())
  const reporterToken = string(reporterSession.access)
  const technician = users.find((user) => user.username === 'tech')
  const gps = () => ({
    latitude: -12.1739,
    longitude: -77.0181,
    accuracy: 8,
    capturedAt: Date.now(),
  })
  await call(request, `/visitas/pool/${caseId}/tomar/`, techToken, {})
  await call(request, `/visitas/${caseId}/iniciar/`, techToken, { location: gps() })
  await call(request, `/visitas/${caseId}/formulario/`, techToken, { location: gps() })
  const tasks = Array.isArray(firstVisit.tasks) ? firstVisit.tasks.map(object) : []
  const photo = await request.post(api + '/evidencias/', {
    headers: { Authorization: 'Bearer ' + techToken },
    multipart: {
      id: crypto.randomUUID(),
      foto: { name: 'checklist.jpg', mimeType: 'image/jpeg', buffer: jpeg },
      source: 'gallery',
      visitId: caseId,
      taskId: Number(tasks[0]?.id),
    },
  })
  expect(photo.ok()).toBe(true)
  const imageId = string(object(await photo.json()).id)
  await call(request, `/visitas/${caseId}/borrador/`, techToken, {
    revision: 0,
    answers: [
      { taskId: Number(tasks[0]?.id), result: 'conforme', observation: '', evidenceIds: [imageId] },
    ],
    workDescription: '',
    evidenceIds: [],
  })
  await call(request, `/visitas/${caseId}/finalizar/`, techToken, { location: gps() })
  let metrics = object(await call(request, '/dashboard/', accountToken))
  const initialRisks = Array.isArray(metrics.risks) ? metrics.risks.map(object) : []
  expect(initialRisks.find((row) => row.storeId === storeId)?.completed).toBe(0)
  for (let index = 0; index < 2; index++) {
    const ticket = object(
      await call(request, '/tickets/', reporterToken, {
        storeId,
        categoryId: categories[0]?.id,
        priorityId: priorities[0]?.id,
        description: 'Isolated monthly intervention ' + index,
        evidenceIds: [],
      }),
    )
    const scheduled = object(
      await call(request, `/tickets/${Number(ticket.id)}/programar/`, accountToken, {
        technicianId: technician?.id,
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        priorityId: priorities[0]?.id,
        reason: '',
        revision: 0,
      }),
    )
    const visitId = Number(scheduled.visitId)
    await call(request, `/visitas/${visitId}/iniciar/`, techToken, { location: gps() })
    await call(request, `/visitas/${visitId}/formulario/`, techToken, {})
    const uploaded = await request.post(api + '/evidencias/', {
      headers: { Authorization: 'Bearer ' + techToken },
      multipart: {
        id: crypto.randomUUID(),
        foto: { name: 'resolution.jpg', mimeType: 'image/jpeg', buffer: jpeg },
        source: 'gallery',
        visitId,
      },
    })
    expect(uploaded.ok()).toBe(true)
    const evidenceId = string(object(await uploaded.json()).id)
    await call(request, `/visitas/${visitId}/borrador/`, techToken, {
      revision: 0,
      workDescription: 'Repair completed and verified ' + index,
      answers: [],
      evidenceIds: [evidenceId],
    })
    await call(request, `/visitas/${visitId}/finalizar/`, techToken, { location: gps() })
  }
  metrics = object(await call(request, '/dashboard/', accountToken))
  const risks = Array.isArray(metrics.risks) ? metrics.risks.map(object) : []
  expect(risks.find((row) => row.storeId === storeId)?.completed).toBe(2)
  expect(risks.find((row) => row.storeId === otherStoreId)?.missing).toBe(2)
  await login(page, 'account')
  await page.goto('/technical-supervisor/reports')
  const firstRow = page
    .getByRole('table', { name: 'Mínimo de tickets por tienda', exact: true })
    .getByRole('row')
    .filter({ hasText: string(rawStore.name) })
  const secondRow = page
    .getByRole('table', { name: 'Mínimo de tickets por tienda', exact: true })
    .getByRole('row')
    .filter({ hasText: string(rawOtherStore.name) })
  await expect(firstRow).toContainText('2 / 2')
  await expect(firstRow).toContainText('Mínimo cumplido')
  await expect(secondRow).toContainText('0 / 2')
  await expect(secondRow).toContainText('Pendiente')
  await page.reload()
  await expect(firstRow).toContainText('2 / 2')
  await expect(page.getByText('SLA: pendiente de definición.', { exact: true })).toBeVisible()
  const rawContracts = await call(request, '/admin/contratos/', adminToken)
  const contracts = Array.isArray(rawContracts) ? rawContracts.map(object) : []
  const original = contracts.find(
    (contract) => contract.clientId === rawStore.clientId && contract.active === true,
  )
  if (!original) throw new Error('No existe contrato de la tienda de prueba.')
  const { id: originalId, ...body } = original
  expect(originalId).toBeDefined()
  const duplicate = await request.post(api + '/admin/contratos/', {
    headers: { Authorization: 'Bearer ' + adminToken, 'Idempotency-Key': crypto.randomUUID() },
    data: body,
  })
  expect(duplicate.status()).toBe(400)
  expect(object(await duplicate.json()).startDate).toBeDefined()
  await reporterContext.close()
})

test('administración crea una plantilla real y conserva sus tareas al recargar', async ({
  page,
}) => {
  await login(page, 'admin')
  await page.goto('/admin/templates')
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
  const name = 'E2E template ' + Date.now()
  await page.getByLabel('Nombre de plantilla').fill(name)
  await page.getByRole('button', { name: 'Agregar ítem' }).click()
  await page.getByLabel('Ítem 1', { exact: true }).fill('Verify persisted component')
  await page.getByRole('button', { name: 'Revisar cambios' }).click()
  await page.getByRole('button', { name: 'Confirmar y guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText(new RegExp(name)).first()).toBeVisible()
})

test('administración: cliente, tienda, contrato, usuario, asignación y contraseñas reales', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8)
  const clientName = 'E2E client ' + suffix
  const storeName = 'E2E store ' + suffix
  const username = 'e2e-' + suffix
  const save = async () => {
    await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
    await page.getByRole('button', { name: 'Confirmar y guardar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await login(page, 'admin')
  await page.goto('/admin/clients')
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
  await page.getByLabel('Razón social').fill(clientName)
  await page.getByLabel('RUC / identificación').fill('E2E-' + suffix)
  await page.getByLabel('Correo de contacto').fill('contact@test.invalid')
  await save()
  await page.reload()
  await expect(page.getByText(clientName, { exact: false }).first()).toBeVisible()
  await page.goto('/admin/stores')
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
  await page.getByLabel('Nombre de tienda').fill(storeName)
  await page.getByLabel('Dirección', { exact: true }).fill('Isolated test address')
  await page.getByLabel('Contacto', { exact: true }).fill('Field contact')
  await page.getByLabel('Latitud').fill('-12.173900')
  await page.getByLabel('Longitud').fill('-77.018100')
  await page.getByLabel('Cliente', { exact: true }).selectOption({ label: clientName })
  await save()
  await page.goto('/admin/contracts')
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
  await page.getByLabel('Cliente', { exact: true }).selectOption({ label: clientName })
  await page.getByLabel('Visitas mensuales').fill('3')
  await save()
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'Crear registro', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Usuario de acceso', { exact: true }).fill(username)
  const initialPassword = 'V7!qx3#Hp9$Lm2zR'
  await dialog.getByLabel('Contraseña inicial (obligatoria al crear)').fill(initialPassword)
  await dialog.getByLabel('Nombre completo').fill('New Technician ' + suffix)
  await dialog.getByLabel('Correo', { exact: true }).fill(username + '@test.invalid')
  await dialog.getByLabel(storeName, { exact: true }).check()
  await save()
  const adminToken = await access(request, 'admin')
  const raw = await call(request, '/admin/usuarios/', adminToken)
  if (!Array.isArray(raw)) throw new Error('Usuarios incompatibles.')
  const created = raw.map(object).find((user) => user.username === username)
  expect(created?.passwordInitialized).toBe(false)
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/login')
  await login(page, username, initialPassword)
  await expect(page.getByRole('heading', { name: 'Cambiar contraseña', exact: true })).toBeVisible()
  const newPassword = 'More-than-initial-2026!'
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click()
  await expect(page.getByText('Cambio registrado correctamente.')).toBeVisible()
  await page.getByRole('link', { name: 'Volver al inicio', exact: true }).click()
  await expect(page.getByText(storeName, { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Visita mensual 1 de 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Visita mensual 2 de 3', { exact: true })).toBeVisible()
  await expect(page.getByText('Visita mensual 3 de 3', { exact: true })).toBeVisible()
  const session = await page.evaluate(() => sessionStorage.getItem('nf:session:api:v1'))
  const credentials: unknown = JSON.parse(session ?? 'null')
  const userToken = object(credentials).access
  if (typeof userToken !== 'string') throw new Error('Sin sesión real del nuevo técnico.')
  const visits = await call(request, '/checklists/', userToken)
  if (!Array.isArray(visits)) throw new Error('Bolsa incompatible.')
  expect(visits).toHaveLength(3)
  expect(
    visits
      .map(object)
      .map((record) => record.quota)
      .sort(),
  ).toEqual([1, 2, 3])
  for (const record of visits.map(object).slice(0, 2)) {
    await call(request, '/visitas/pool/' + String(record.id) + '/tomar/', userToken, {})
  }
  await page.reload()
  await page.getByRole('button', { name: 'Mis trabajos', exact: true }).click()
  await expect(page.getByRole('heading', { name: storeName, exact: true })).toHaveCount(2)
  await page.goto('/profile/password')
  await page.getByLabel('Contraseña actual').fill(newPassword)
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('Another-secure-password-2026!')
  await page
    .getByLabel('Confirmar contraseña', { exact: true })
    .fill('Another-secure-password-2026!')
  await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click()
  await expect(page.getByText('Cambio registrado correctamente.')).toBeVisible()
})

test('checklist: cámara real del navegador y galería interrumpida reintentan sin duplicar fotos', async ({
  page,
  context,
  request,
}) => {
  const id = checklistCase()
  const token = await access(request, 'tech')
  await login(page)
  await page.goto('/checklists/' + id)
  await page.getByRole('button', { name: 'Obtener ubicación', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar checklist', exact: true }).click()
  await page.getByRole('button', { name: 'Finalizar checklist', exact: true }).click()
  await page.getByRole('button', { name: '✓ Conforme', exact: true }).click()
  await page.getByRole('button', { name: 'Tomar foto', exact: true }).click()
  const camera = page.getByRole('dialog')
  await camera.getByRole('button', { name: 'Capturar', exact: true }).click()
  await camera.getByRole('button', { name: 'Confirmar foto', exact: true }).click()
  await expect(camera).toHaveCount(0)
  await expect(page.locator('.nf-evidence img')).toHaveCount(1)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Seleccionar de galería', exact: true }).click()
  const { jpeg } = await import('./helpers.js')
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'retry.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  await expect(page.getByRole('button', { name: 'Reintentar carga', exact: true })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Reintentar carga', exact: true }).click()
  await expect(page.locator('.nf-evidence img')).toHaveCount(2)
  await expect(
    page.getByRole('button', { name: 'Reintentar carga', exact: true }),
  ).not.toBeVisible()
  await page.reload()
  await expect(page.locator('.nf-evidence img')).toHaveCount(2)
  const confirmed = object(await call(request, '/visitas/' + id + '/', token))
  if (!Array.isArray(confirmed.answers)) throw new Error('Respuestas incompatibles.')
  expect(object(confirmed.answers[0]).evidenceIds).toHaveLength(2)
})

test('dos dispositivos detectan conflicto de borrador y concilian con confirmación explícita', async ({
  page,
  browser,
  request,
}) => {
  const id = checklistCase()
  const token = await access(request, 'tech')
  await login(page)
  await page.goto('/checklists/' + id)
  await page.getByRole('button', { name: 'Obtener ubicación', exact: true }).click()
  await page.getByRole('button', { name: 'Iniciar checklist', exact: true }).click()
  await page.getByRole('button', { name: 'Finalizar checklist', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Finalizar checklist', exact: true })).toBeVisible()
  const context = await browser.newContext()
  const another = await context.newPage()
  await login(another)
  await another.goto('/checklists/' + id + '/start')
  await expect(
    another.getByRole('button', { name: 'Finalizar checklist', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '✓ Conforme', exact: true }).click()
  await upload(page)
  await another.getByRole('button', { name: 'No aplica', exact: true }).click()
  await expect(
    another.getByRole('heading', { name: 'Borrador modificado en otra sesión' }),
  ).toBeVisible()
  await expect(another.getByRole('button', { name: 'No aplica', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await another.getByRole('button', { name: 'Consultar versión del servidor', exact: true }).click()
  await another
    .getByRole('button', { name: 'Guardar mis respuestas sobre esta versión', exact: true })
    .click()
  await expect(another.getByText('Borrador guardado.', { exact: true })).toBeVisible()
  await expect(another.locator('.nf-evidence img')).toHaveCount(1)
  const current = object(await call(request, '/visitas/' + id + '/', token))
  if (!Array.isArray(current.answers)) throw new Error('Respuestas incompatibles.')
  expect(object(current.answers[0]).result).toBe('no_aplica')
  expect(object(current.answers[0]).evidenceIds).toHaveLength(1)
  await context.close()
})
