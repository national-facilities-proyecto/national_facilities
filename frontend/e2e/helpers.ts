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
  if (mode !== 'expire') {
    execFileSync(python, [resolve('../backend/test_support/clock.py'), String(id), mode], {
      cwd: resolve('..'),
    })
    return
  }
  // Adelanta toda la cronología de un caso aislado; respeta fin físico <= apertura.
  // El helper antiguo solo desplazaba apertura e incumple la constraint V2.
  execFileSync(
    python,
    [
      '-c',
      `
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path('backend').resolve()))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.test_settings')
import django
django.setup()
from django.db import connection, transaction
from django.utils import timezone
from datetime import timedelta
from core.models import Visita
if os.environ['DJANGO_SETTINGS_MODULE'] != 'config.test_settings' or connection.settings_dict['NAME'] != 'nf_integration':
    raise RuntimeError('Reloj permitido solo en base E2E aislada.')
with transaction.atomic():
    v = Visita.objects.select_for_update().get(pk=int(sys.argv[1]), tienda__cliente__ruc='E2E-ONLY')
    if not all((v.iniciado_en, v.terminado_en, v.formulario_abierto_en)) or v.enviado_en or v.completado_en:
        raise RuntimeError('Se requiere un formulario V2 abierto y todavía no enviado.')
    delta = v.formulario_abierto_en - (timezone.now() - timedelta(minutes=6))
    for field in ('iniciado_en', 'terminado_en', 'formulario_abierto_en'):
        setattr(v, field, getattr(v, field) - delta)
    v.save(update_fields=['iniciado_en', 'terminado_en', 'formulario_abierto_en'])
`,
      String(id),
    ],
    { cwd: resolve('..') },
  )
}
export async function upload(page: Page) {
  await page.getByRole('button', { name: 'Seleccionar de galería', exact: true }).first().click()
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'evidence.jpg', mimeType: 'image/jpeg', buffer: jpeg })
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
  await expect(page.locator('fieldset .nf-evidence img')).toHaveCount(1)
}

export async function arrive(page: Page, id: number, origin: 'checklist' | 'ticket' = 'checklist') {
  await page.goto((origin === 'checklist' ? '/checklists/' : '/routes/') + id)
  const claim = page.getByRole('button', { name: 'Tomar checklist', exact: true })
  const arrival = page.getByRole('button', { name: 'Registrar llegada', exact: true })
  await expect(claim.or(arrival).first()).toBeVisible()
  if (origin === 'checklist' && (await claim.isVisible())) await claim.click()
  await arrival.click()
  await expect(
    page.getByRole('heading', {
      name: origin === 'checklist' ? 'Recorrido de inspección' : 'Atención en curso',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tiempo de registro del formulario' })).toHaveCount(
    0,
  )
}
export async function openResults(page: Page, origin: 'checklist' | 'ticket' = 'checklist') {
  await page
    .getByRole('button', {
      name: origin === 'checklist' ? 'Terminar recorrido' : 'Terminar atención',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('heading', {
      name: origin === 'checklist' ? 'Recorrido terminado' : 'Atención terminada',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tiempo de registro del formulario' })).toHaveCount(
    0,
  )
  await page
    .getByRole('button', {
      name: origin === 'checklist' ? 'Registrar resultados' : 'Registrar resolución',
      exact: true,
    })
    .click()
  await expect(page.getByRole('button', { name: /^(Finalizar|Enviar a revisión)$/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tiempo de registro del formulario' })).toHaveCount(
    0,
  )
}
export async function waitUntilScheduled(request: APIRequestContext, id: number, token: string) {
  await expect
    .poll(async () => {
      const raw = object(await call(request, `/visitas/${id}/`, token))
      return Date.parse(string(raw.serverNow)) >= Date.parse(string(raw.scheduledAt))
    })
    .toBe(true)
}

export async function cameraPhoto(page: Page, button = 'Tomar foto') {
  await page.getByRole('button', { name: button, exact: true }).click()
  const camera = page.getByRole('dialog', { name: 'Tomar fotografía', exact: true })
  await camera.getByRole('button', { name: 'Capturar', exact: true }).click()
  await camera.getByRole('button', { name: 'Confirmar foto', exact: true }).click()
  await expect(camera).toHaveCount(0)
}
export async function arrivalException(
  page: Page,
  id: number,
  origin: 'checklist' | 'ticket' = 'checklist',
) {
  await page.goto((origin === 'checklist' ? '/checklists/' : '/routes/') + id)
  const claim = page.getByRole('button', { name: 'Tomar checklist', exact: true })
  const arrival = page.getByRole('button', { name: 'Registrar llegada', exact: true })
  await expect(claim.or(arrival).first()).toBeVisible()
  if (origin === 'checklist' && (await claim.isVisible())) await claim.click()
  await arrival.click()
  await page.getByRole('button', { name: 'Solicitar excepción GPS', exact: true }).click()
  await page
    .getByLabel('Motivo de la excepción')
    .fill('El permiso de ubicación no estuvo disponible al llegar.')
  await expect(
    page.getByRole('button', { name: 'Guardar excepción GPS', exact: true }),
  ).toBeDisabled()
  await cameraPhoto(page, 'Tomar foto del establecimiento')
  await page.getByRole('button', { name: 'Guardar excepción GPS', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: origin === 'checklist' ? 'Recorrido de inspección' : 'Atención en curso',
      exact: true,
    }),
  ).toBeVisible()
}
