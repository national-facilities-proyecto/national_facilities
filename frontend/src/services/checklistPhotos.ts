import type { Evidence } from '../types/models'
import { AppError } from './errors'

type StoredPhoto = { id: string; scope: string; photo: Evidence }
export const CHECKLIST_PHOTOS_DB = 'nf:checklist:photos:v1'

async function storage<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CHECKLIST_PHOTOS_DB, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('photos', { keyPath: 'id' })
      store.createIndex('scope', 'scope')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new AppError('storage', 'No se pudo abrir la bandeja de fotografías.'))
  })
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('photos', mode)
    const request = work(tx.objectStore('photos'))
    tx.oncomplete = () => {
      db.close()
      resolve(request.result)
    }
    tx.onerror = tx.onabort = () => {
      db.close()
      reject(
        new AppError(
          'storage',
          'No se pudo conservar la fotografía. Revisa el espacio disponible.',
        ),
      )
    }
  })
}

export const checklistPhotos = {
  async list(scope: string): Promise<Evidence[]> {
    const records = await storage(
      'readonly',
      (store) => store.index('scope').getAll(scope) as IDBRequest<StoredPhoto[]>,
    )
    return records.map((record) => record.photo)
  },
  async put(scope: string, photo: Evidence): Promise<void> {
    await storage('readwrite', (store) => store.put({ id: scope + ':' + photo.id, scope, photo }))
  },
  async remove(scope: string, id: string): Promise<void> {
    await storage('readwrite', (store) => store.delete(scope + ':' + id))
  },
}
