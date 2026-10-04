import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { checklistPhotos } from './checklistPhotos'
import type { Evidence } from '../types/models'
import { Blob as StructuredBlob } from 'node:buffer'

it('conserva blobs y fecha de captura por usuario y visita hasta asociarlos', async () => {
  const photo: Evidence = {
    id: crypto.randomUUID(),
    name: 'recorrido.jpg',
    mimeType: 'image/jpeg',
    size: 5,
    capturedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    source: 'camera',
    blob: new StructuredBlob(['photo'], { type: 'image/jpeg' }) as Blob,
  }
  const scope = 'api:1:' + crypto.randomUUID()
  await checklistPhotos.put(scope, photo)
  const recovered = await checklistPhotos.list(scope)
  expect(recovered).toHaveLength(1)
  expect(recovered[0].blob.size).toBe(5)
  expect(recovered[0].capturedAt).toBe(photo.capturedAt)
  expect(await checklistPhotos.list('api:2:' + scope)).toEqual([])
  expect(await checklistPhotos.list(scope + ':other-visit')).toEqual([])
  await checklistPhotos.remove(scope, photo.id)
  expect(await checklistPhotos.list(scope)).toEqual([])
})
