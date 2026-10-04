import { expect } from '@playwright/test'
import type { Page, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DTO inválido.')
  return Object.fromEntries(Object.entries(value))
}
export function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Texto inválido.')
  return value
}
export function mapVisit(value: unknown) {
  const v = object(value)
  if (typeof v.id !== 'number') throw new Error('ID inválido.')
  return {
    id: v.id,
    status: string(v.status),
    formOpenedAt: typeof v.formOpenedAt === 'string' ? v.formOpenedAt : undefined,
    expiresAt: typeof v.expiresAt === 'string' ? v.expiresAt : undefined,
  }
}
export function mapTicket(value: unknown) {
  const v = object(value)
  return {
    status: string(v.status),
    visitId: typeof v.visitId === 'number' ? v.visitId : undefined,
  }
}
export const python =
  process.env.NF_TEST_PYTHON ??
  resolve(process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python')
export function checklistCase() {
  return Number(
    execFileSync(python, [resolve('../backend/test_support/checklist_case.py')], {
      cwd: resolve('..'),
      encoding: 'utf8',
    }).trim(),
  )
}
export const api = process.env.NF_TEST_API_URL ?? 'http://127.0.0.1:8000/api'
export const password = 'Field-test-secure-2026!'
export const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCkA//Z',
  'base64',
)

export async function access(request: APIRequestContext, username: string) {
  const response = await request.post(api + '/auth/login/', { data: { username, password } })
  expect(response.ok()).toBe(true)
  const raw: unknown = await response.json()
  return string(object(raw).access)
}
export async function login(page: Page, username = 'tech', credential = password) {
  await page.goto('/login')
  await page.getByLabel('Usuario', { exact: true }).fill(username)
  await page.getByLabel('Contraseña', { exact: true }).fill(credential)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: /Perfil de/ })).toBeVisible()
}
export async function call(
  request: APIRequestContext,
  path: string,
  token: string,
  data?: unknown,
) {
  const headers = { Authorization: 'Bearer ' + token, 'Idempotency-Key': crypto.randomUUID() }
  const response =
    data === undefined
      ? await request.get(api + path, { headers })
      : await request.post(api + path, { headers, data })
  expect(response.ok(), await response.text()).toBe(true)
  const raw: unknown = await response.json()
  return raw
}
export async function visit(request: APIRequestContext, id: number, token: string) {
  return mapVisit(await call(request, '/visitas/' + id + '/', token))
}
// Mis Rutas contains ticket visits, not the shared checklist pool. Each map test
// needs its own pending visit rather than data left by another E2E run.
export async function scheduledMapVisit(request: APIRequestContext) {
  const storeToken = await access(request, 'store')
  const stores = await call(request, '/tiendas/', storeToken)
  const catalogs = object(await call(request, '/catalogos/', storeToken))
  if (!Array.isArray(stores) || !stores.length) throw new Error('Sin tienda aislada.')
  if (!Array.isArray(catalogs.categories) || !Array.isArray(catalogs.priorities))
    throw new Error('Sin catálogo.')
  const priorityId = object(catalogs.priorities[0]).id
  const ticket = object(
    await call(request, '/tickets/', storeToken, {
      storeId: object(stores[0]).id,
      categoryId: object(catalogs.categories[0]).id,
      priorityId,
      description: 'Pending visit for map loading and provider recovery.',
      evidenceIds: [],
    }),
  )
  const accountToken = await access(request, 'account')
  const users = await call(request, '/usuarios/', accountToken)
  if (!Array.isArray(users)) throw new Error('Usuarios incompatibles.')
  const tech = users.map(object).find((user) => user.username === 'tech')
  const scheduled = object(
    await call(request, `/tickets/${String(ticket.id)}/programar/`, accountToken, {
      technicianId: tech?.id,
      scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      priorityId,
      reason: '',
      revision: 0,
    }),
  )
  if (typeof scheduled.visitId !== 'number') throw new Error('Sin visita de mapa.')
  return scheduled.visitId
}
export function advance(id: number, mode: 'work' | 'expire' | 'expire_claim') {
  execFileSync(python, [resolve('../backend/test_support/clock.py'), String(id), mode], {
    cwd: resolve('..'),
  })
}
export async function upload(page: Page) {
  await page.getByRole('button', { name: 'Seleccionar de galería', exact: true }).first().click()
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'evidence.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
  await expect(page.locator('fieldset .nf-evidence img')).toHaveCount(1)
}
