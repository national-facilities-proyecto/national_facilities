import type { Repositories } from '../repositories/contracts'
import type { Session, AdminKind, AdminEntities, Catalogs } from '../../types/models'
import { AppError } from '../errors'
import { createHttpClient, savedSession, persistSession } from '../http/client'
import { clearNfSession, validSession } from '../../features/auth/session'
import {
  mapStore,
  mapUser,
  mapVisit,
  mapTicket,
  mapClient,
  mapContract,
  mapTemplate,
  mapEvidence,
  mapCatalogs,
  mapDashboard,
  object,
  rows,
  number,
  string,
} from './mappers'
export { mapStore } from './mappers'

const paths: Record<AdminKind, string> = {
  users: 'usuarios',
  stores: 'tiendas',
  clients: 'clientes',
  contracts: 'contratos',
  templates: 'plantillas',
}
const mappers: { [K in AdminKind]: (v: unknown) => AdminEntities[K] } = {
  users: mapUser,
  stores: mapStore,
  clients: mapClient,
  contracts: mapContract,
  templates: mapTemplate,
}
function mapSession(raw: unknown): Session {
  const v = object(raw)
  const session = {
    access: string(v.access),
    refresh: string(v.refresh),
    expiresAt: number(v.expiresAt),
    user: mapUser(v.user),
    source: 'api' as const,
  }
  if (!validSession(session))
    throw new AppError('unauthorized', 'La cuenta no tiene una sesión y un rol activos.')
  return session
}
export function createHttpRepositories(apiUrl: string): Repositories {
  const request = createHttpClient(apiUrl)
  const pendingKeys = new Map<string, string>()
  const mutate = async (
    path: string,
    body: unknown = {},
    method = 'POST',
    notify = true,
  ): Promise<unknown> => {
    const serialized = JSON.stringify(body)
    const signature = apiUrl + savedSession()?.user.id + method + path + serialized
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature))
    const storageKey =
      'nf:operation:' +
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    // Solo conserva un identificador de reintento; no guarda contenido operativo.
    const key =
      pendingKeys.get(signature) ?? sessionStorage.getItem(storageKey) ?? crypto.randomUUID()
    pendingKeys.set(signature, key)
    sessionStorage.setItem(storageKey, key)
    try {
      const raw = await request(path, {
        method,
        body: serialized,
        headers: { 'Idempotency-Key': key },
      })
      if (path.startsWith('/visitas/')) mapVisit(raw)
      if (path.startsWith('/tickets/')) mapTicket(raw)
      for (const kind of ['users', 'stores', 'clients', 'contracts', 'templates'] as const) {
        if (path.startsWith('/admin/' + paths[kind] + '/')) mappers[kind](raw)
      }
      pendingKeys.delete(signature)
      sessionStorage.removeItem(storageKey)
      if (notify) window.dispatchEvent(new Event('nf:data'))
      return raw
    } catch (error) {
      // Errores con respuesta clara permiten una operación distinta. Un timeout conserva la clave.
      if (error instanceof AppError && error.status && error.status < 500) {
        pendingKeys.delete(signature)
        sessionStorage.removeItem(storageKey)
      }
      throw error
    }
  }
  const catalogs = async (): Promise<Catalogs> => mapCatalogs(await request('/catalogos/'))
  const priorityId = async (name: string) => {
    const catalog = await catalogs()
    const priority = catalog.priorities.find((p) => p.name === name)
    if (!priority)
      throw new AppError('validation', 'Selecciona una prioridad vigente del catálogo.')
    return priority.id
  }
  return {
    source: 'api',
    auth: {
      async login(input) {
        if (input.kind !== 'credentials')
          throw new AppError('validation', 'Ingresa tus credenciales.')
        const session = mapSession(
          await request('/auth/login/', {
            method: 'POST',
            body: JSON.stringify({ username: input.username, password: input.password }),
          }),
        )
        clearNfSession()
        persistSession(session)
        return session
      },
      async restore() {
        const current = savedSession()
        if (!current) return null
        const user = mapUser(await request('/auth/me/'))
        const updated = savedSession()
        if (!updated) return null
        const session = { ...updated, user }
        persistSession(session)
        return session
      },
      async refresh() {
        return await request.refresh()
      },
      async logout() {
        await request('/auth/logout/', { method: 'POST', body: '{}' })
        clearNfSession()
      },
      async changePassword(password, currentPassword = '', confirmation = password) {
        const session = mapSession(
          await request('/auth/password/', {
            method: 'POST',
            body: JSON.stringify({ password, currentPassword, confirmation }),
          }),
        )
        persistSession(session)
        return session
      },
    },
    stores: {
      async list(options) {
        return rows(await request('/tiendas/', { signal: options?.signal })).map(mapStore)
      },
      async get(id, options) {
        return mapStore(await request('/tiendas/' + id + '/', { signal: options?.signal }))
      },
    },
    checklists: {
      async generate() {
        await mutate('/checklists/generar/', {}, 'POST', false)
      },
      async list(options) {
        return rows(await request('/checklists/', { signal: options?.signal })).map(mapVisit)
      },
      async get(id, options) {
        return mapVisit(await request('/visitas/' + id + '/', { signal: options?.signal }))
      },
      async claim(id) {
        return mapVisit(await mutate('/visitas/pool/' + id + '/tomar/'))
      },
      async saveDraft(id, input) {
        return mapVisit(
          await mutate('/visitas/' + id + '/borrador/', {
            ...input,
            revision: input.revision ?? 0,
          }),
        )
      },
    },
    visits: {
      async list(options) {
        return rows(await request('/visitas/programadas/', { signal: options?.signal })).map(
          mapVisit,
        )
      },
      async get(id, options) {
        return mapVisit(await request('/visitas/' + id + '/', { signal: options?.signal }))
      },
      async start(id, location) {
        return mapVisit(await mutate('/visitas/' + id + '/iniciar/', { location }))
      },
      async openForm(id, location, failure) {
        return mapVisit(await mutate('/visitas/' + id + '/formulario/', location ? { location } : { failure }))
      },
      async recordEndGps(id, location) {
        return mapVisit(await mutate('/visitas/' + id + '/ubicacion-cierre/', { location }))
      },
      async submitReview(id, input) {
        return mapVisit(await mutate('/visitas/' + id + '/enviar-revision/', input))
      },
      async complete(id, location) {
        return mapVisit(await mutate('/visitas/' + id + '/finalizar/', { location }))
      },
      async requestException(id, reason, failure) {
        return mapVisit(
          await mutate('/visitas/' + id + '/excepciones/', { type: 'location', reason, failure }),
        )
      },
      async requestTimeException(id, reason) {
        return mapVisit(
          await mutate('/visitas/' + id + '/excepciones/', { type: 'time_limit', reason }),
        )
      },
      async reviewException(id, approved, reason, exceptionId, versions) {
        if (!exceptionId || !versions)
          throw new AppError('validation', 'Selecciona la excepción que vas a revisar.')
        return mapVisit(
          await mutate('/visitas/' + id + '/revisar/', {
            approved,
            reason,
            exceptionId,
            ...versions,
          }),
        )
      },
    },
    tickets: {
      catalogs,
      async list(options) {
        return rows(await request('/tickets/', { signal: options?.signal })).map(mapTicket)
      },
      async get(id, options) {
        return mapTicket(await request('/tickets/' + id + '/', { signal: options?.signal }))
      },
      async create(input) {
        const catalog = await catalogs()
        const category = catalog.categories.find((c) => c.name === input.category)
        const priority = catalog.priorities.find((p) => p.name === input.priority)
        if (!category || !priority)
          throw new AppError('validation', 'Selecciona categoría y prioridad del catálogo vigente.')
        return mapTicket(
          await mutate('/tickets/', {
            storeId: input.storeId,
            categoryId: category.id,
            priorityId: priority.id,
            description: input.description,
            evidenceIds: input.evidenceIds,
          }),
        )
      },
      async schedule(id, technicianId, scheduledAt, priority, reason, revision) {
        const raw = await mutate('/tickets/' + id + '/programar/', {
          technicianId,
          scheduledAt: new Date(scheduledAt).toISOString(),
          priorityId: await priorityId(priority),
          reason,
          revision: revision ?? 0,
        })
        return mapTicket(raw)
      },
      async close(id) {
        return mapTicket(await mutate('/tickets/' + id + '/cerrar/'))
      },
    },
    users: {
      async list(options) {
        return rows(await request('/usuarios/', { signal: options?.signal })).map(mapUser)
      },
    },
    dashboard: {
      async get(options) {
        const query = new URLSearchParams()
        if (options?.period) query.set('period', options.period)
        if (options?.clientId) query.set('clientId', String(options.clientId))
        return mapDashboard(
          await request('/dashboard/?' + query.toString(), { signal: options?.signal }),
        )
      },
    },
    reports: {
      async list(period, clientId) {
        return rows(
          await request(
            '/reportes/?' +
              new URLSearchParams({
                period,
                ...(clientId ? { clientId: String(clientId) } : {}),
              }).toString(),
          ),
        ).map(mapVisit)
      },
      async export(period, clientId) {
        const data = await request(
          '/reportes/exportar/?' +
            new URLSearchParams({
              period,
              ...(clientId ? { clientId: String(clientId) } : {}),
            }).toString(),
          {},
          'blob',
        )
        if (!(data instanceof Blob)) throw new AppError('network', 'Exportación incompatible.')
        return data
      },
    },
    administration: {
      async list<K extends AdminKind>(
        kind: K,
        options?: { signal?: AbortSignal },
      ): Promise<AdminEntities[K][]> {
        return rows(await request('/admin/' + paths[kind] + '/', { signal: options?.signal })).map(
          mappers[kind],
        )
      },
      async save<K extends AdminKind>(
        kind: K,
        entity: AdminEntities[K],
      ): Promise<AdminEntities[K]> {
        const { id, ...fields } = entity
        const body = 'endDate' in fields ? { ...fields, endDate: fields.endDate || null } : fields
        const raw = await mutate(
          '/admin/' + paths[kind] + '/' + (id ? id + '/' : ''),
          body,
          id ? 'PUT' : 'POST',
        )
        const current = savedSession()
        if (kind === 'users' && id === current?.user.id)
          persistSession({ ...current, user: mapUser(raw) })
        return mappers[kind](raw)
      },
    },
    evidence: {
      async listTemporary() {
        return rows(await request('/evidencias/')).map((raw) => mapEvidence(raw).id)
      },
      async put(evidence) {
        const data = new FormData()
        data.set('id', evidence.id)
        data.set('foto', evidence.blob, evidence.name)
        data.set('source', evidence.source)
        if (evidence.capturedAt) data.set('capturedAt', evidence.capturedAt)
        if (evidence.taskId !== undefined) data.set('taskId', String(evidence.taskId))
        if (evidence.visitId !== undefined) data.set('visitId', String(evidence.visitId))
        const meta = mapEvidence(await request('/evidencias/', { method: 'POST', body: data }))
        if (meta.id !== evidence.id)
          throw new AppError('network', 'El servidor devolvió otro identificador de evidencia.')
      },
      async get(id) {
        const meta = mapEvidence(await request('/evidencias/' + id + '/'))
        const blob = await request('/evidencias/' + id + '/archivo/', {}, 'blob')
        if (!(blob instanceof Blob))
          throw new AppError('network', 'La fotografía recibida es incompatible.')
        return { ...meta, blob }
      },
      async remove(id) {
        await request('/evidencias/' + id + '/', { method: 'DELETE' })
      },
    },
  }
}
export type ApiLoginContract = Session
