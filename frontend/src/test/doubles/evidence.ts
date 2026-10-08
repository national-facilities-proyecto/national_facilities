import type { Evidence } from '../../types/models'
import type { EvidenceRepository } from '../../services/repositories/contracts'
import { AppError } from '../../services/errors'
export const EVIDENCE_DB = 'nf:mock:evidence:v1'
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EVIDENCE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('evidence', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new AppError('storage', 'No se puede abrir el almacenamiento de fotografías.'))
  })
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('evidence', mode)
    const request = work(tx.objectStore('evidence'))
    tx.oncomplete = () => {
      db.close()
      resolve(request.result)
    }
    tx.onerror = tx.onabort = () => {
      db.close()
      reject(
        new AppError('storage', 'No se pudo guardar la fotografía. Revisa el espacio disponible.'),
      )
    }
  })
}
export const localEvidenceRepository: EvidenceRepository = {
  async listTemporary() {
    return []
  },
  async put(evidence) {
    await transaction('readwrite', (store) => {
      if (evidence.replaceId) store.delete(evidence.replaceId)
      return store.put(evidence)
    })
  },
  async get(id) {
    const value: unknown = await transaction('readonly', (store) => store.get(id))
    if (value === undefined) return undefined
    if (
      typeof value !== 'object' ||
      value === null ||
      !('blob' in value) ||
      !(value.blob instanceof Blob)
    )
      throw new AppError('storage', 'La evidencia almacenada no es válida.')
    return value as Evidence
  },
  async remove(id) {
    await transaction('readwrite', (store) => store.delete(id))
  },
}
export async function clearEvidence(): Promise<void> {
  await transaction('readwrite', (store) => store.clear())
}
