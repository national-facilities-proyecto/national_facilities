import { act, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Evidence, Visit } from '../../types/models'
import { AppError } from '../../services/errors'
import { createFixtures } from '../../test/doubles/fixtures'
import { createMockRepositories } from '../../test/doubles/repositories'
import { renderPage } from '../../test/render'
import { useVisitEditor } from './useVisitEditor'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

const photo: Evidence = {
  id: 'evidence-id',
  name: 'evidence.jpg',
  mimeType: 'image/jpeg',
  blob: new Blob(['photo'], { type: 'image/jpeg' }),
  size: 5,
  source: 'gallery',
}

async function setup(
  existing = false,
  source: 'api' | 'mock' = 'api',
  revision: number | null = 7,
) {
  const repos = { ...createMockRepositories(), source }
  await repos.auth.login({ kind: 'demo', userId: 1 })
  const now = new Date().toISOString()
  const initial: Visit = {
    ...createFixtures().visits[0],
    technicianId: 1,
    status: 'in_progress',
    phase: 'results',
    readOnly: false,
    occupiesTechnician: true,
    startedAt: now,
    physicalEndedAt: now,
    formOpenedAt: now,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    revision: revision ?? undefined,
    workDescription: 'Descripción guardada.',
    evidenceIds: [],
    answers: [
      {
        taskId: 1,
        result: 'no_conforme',
        observation: 'Observación guardada.',
        evidenceIds: existing ? [photo.id] : [],
      },
    ],
  }
  let server = structuredClone(initial)
  const get = vi.spyOn(repos.visits, 'get').mockImplementation(async () => structuredClone(server))
  const save = vi.spyOn(repos.checklists, 'saveDraft').mockImplementation(async (_id, draft) => {
    if (draft.revision !== (server.revision ?? 0))
      throw new AppError('conflict', 'Existe un borrador más reciente.')
    server = { ...server, ...structuredClone(draft), revision: (server.revision ?? 0) + 1 }
    return structuredClone(server)
  })
  const mutateEvidence = (associated: boolean, increment = 1) => {
    server = {
      ...server,
      revision: server.revision! + increment,
      answers: server.answers.map((answer) =>
        answer.taskId === 1
          ? {
              ...answer,
              evidenceIds: associated ? [photo.id] : [],
            }
          : answer,
      ),
    }
  }
  const put = vi.spyOn(repos.evidence, 'put').mockImplementation(async () => mutateEvidence(true))
  const remove = vi
    .spyOn(repos.evidence, 'remove')
    .mockImplementation(async () => mutateEvidence(false))
  let editor!: ReturnType<typeof useVisitEditor>
  function Probe() {
    editor = useVisitEditor(initial)
    return null
  }
  renderPage(<Probe />, repos)
  return {
    editor: () => editor,
    repos,
    get,
    put,
    remove,
    save,
    server: () => server,
    mutateEvidence,
  }
}

it('upload sincroniza r+1 y guarda el borrador en r+2 sin conflicto falso', async () => {
  const test = await setup()
  await act(async () => {
    await test.editor().capture(photo, 1)
  })
  expect(test.get).toHaveBeenCalledWith(1)
  expect(test.save.mock.calls[0][1].revision).toBe(8)
  expect(test.server().revision).toBe(9)
  expect(test.editor().visit.answers[0].evidenceIds).toEqual([photo.id])
  expect(test.editor().conflict).toBe(false)
  expect(test.editor().pendingPhoto).toBeUndefined()
  expect(test.editor().error).toBe('')
})

it('delete sincroniza r+1 antes de desasociar y guardar en r+2', async () => {
  const test = await setup(true)
  act(() => test.editor().remove(photo.id, 1))
  await waitFor(() => expect(test.save).toHaveBeenCalledOnce())
  await waitFor(() => expect(test.editor().saving).toBe(false))
  expect(test.save.mock.calls[0][1].revision).toBe(8)
  expect(test.server().revision).toBe(9)
  expect(test.editor().visit.answers[0].evidenceIds).toEqual([])
  expect(test.editor().conflict).toBe(false)
})

for (const operation of ['upload', 'delete'] as const)
  it(`${operation}: un cambio concurrente real abre conciliación sin sobrescribir remoto`, async () => {
    const test = await setup(operation === 'delete')
    const concurrent = async () => {
      test.mutateEvidence(operation === 'upload', 2)
    }
    if (operation === 'upload') test.put.mockImplementation(concurrent)
    else test.remove.mockImplementation(concurrent)
    act(() => {
      test.editor().update({ workDescription: 'Descripción local todavía sin guardar.' })
      test.editor().patchAnswer(1, { observation: 'Observación local pendiente.' })
    })
    if (operation === 'upload')
      await act(async () => {
        await expect(test.editor().capture(photo, 1)).rejects.toMatchObject({ code: 'conflict' })
      })
    else {
      act(() => test.editor().remove(photo.id, 1))
      await waitFor(() => expect(test.editor().conflict).toBe(true))
    }
    expect(test.editor().remote?.revision).toBe(9)
    expect(test.editor().visit.workDescription).toBe('Descripción local todavía sin guardar.')
    expect(test.editor().visit.answers[0].observation).toBe('Observación local pendiente.')
    expect(test.editor().error).toMatch(/concilia/)
    expect(test.save).not.toHaveBeenCalled()
    expect(test.server().workDescription).toBe('Descripción guardada.')
    await act(async () => {
      await expect(test.editor().save()).rejects.toMatchObject({ code: 'conflict' })
    })
    expect(test.save).not.toHaveBeenCalled()
    if (operation === 'upload') expect(test.editor().pendingPhoto?.photo.id).toBe(photo.id)
  })

it('sincronizar la revisión propia conserva respuestas y descripción locales', async () => {
  const test = await setup()
  act(() => {
    test.editor().update({ workDescription: 'Descripción local nueva.' })
    test.editor().patchAnswer(1, { observation: 'Observación local nueva.', result: 'no_aplica' })
  })
  await act(async () => {
    await test.editor().capture(photo, 1)
  })
  const draft = test.save.mock.calls[0][1]
  expect(draft.workDescription).toBe('Descripción local nueva.')
  expect(draft.answers[0]).toMatchObject({
    observation: 'Observación local nueva.',
    result: 'no_aplica',
    evidenceIds: [photo.id],
  })
  expect(test.editor().visit.workDescription).toBe('Descripción local nueva.')
  expect(test.editor().visit.answers[0].observation).toBe('Observación local nueva.')
})

it('upload idempotente confirmado por GET no fabrica un incremento de revisión', async () => {
  const test = await setup(true)
  test.put.mockResolvedValue(undefined)
  await act(async () => {
    await test.editor().capture(photo, 1)
  })
  expect(test.save.mock.calls[0][1].revision).toBe(7)
  expect(test.server().revision).toBe(8)
  expect(test.editor().conflict).toBe(false)
  expect(test.editor().visit.answers[0].evidenceIds).toEqual([photo.id])
})

it('evidencia local mock conserva revisión 0 sin inventar una mutación del borrador', async () => {
  const test = await setup(false, 'mock', null)
  test.put.mockResolvedValue(undefined)
  await act(async () => {
    await test.editor().capture(photo, 1)
  })
  expect(test.save.mock.calls[0][1].revision).toBe(0)
  expect(test.server().revision).toBe(1)
  expect(test.editor().conflict).toBe(false)
})

it('upload sin incremento ni asociación confirmada no adopta una revisión ficticia', async () => {
  const test = await setup()
  test.put.mockResolvedValue(undefined)
  await act(async () => {
    await expect(test.editor().capture(photo, 1)).rejects.toMatchObject({ code: 'conflict' })
  })
  expect(test.editor().remote?.revision).toBe(7)
  expect(test.editor().conflict).toBe(true)
  expect(test.editor().pendingPhoto?.photo.id).toBe(photo.id)
  expect(test.save).not.toHaveBeenCalled()
})

it('delete sin incremento confirmado por GET guarda usando la revisión real', async () => {
  const test = await setup()
  test.remove.mockResolvedValue(undefined)
  act(() => test.editor().remove(photo.id, 1))
  await waitFor(() => expect(test.save).toHaveBeenCalledOnce())
  await waitFor(() => expect(test.editor().saving).toBe(false))
  expect(test.save.mock.calls[0][1].revision).toBe(7)
  expect(test.server().revision).toBe(8)
  expect(test.editor().conflict).toBe(false)
})

it('GET fallido conserva la foto y permite reintentar el POST idempotente', async () => {
  const test = await setup()
  test.get.mockRejectedValueOnce(new AppError('network', 'No se pudo consultar la visita.'))
  await act(async () => {
    await expect(test.editor().capture(photo, 1)).rejects.toMatchObject({ code: 'network' })
  })
  expect(test.editor().pendingPhoto?.photo.id).toBe(photo.id)
  expect(test.save).not.toHaveBeenCalled()
  test.put.mockResolvedValue(undefined)
  await act(async () => {
    await test.editor().capture(photo, 1)
  })
  expect(test.save.mock.calls[0][1].revision).toBe(8)
  expect(test.server().revision).toBe(9)
  expect(test.editor().pendingPhoto).toBeUndefined()
})

it('guardado encolado durante upload utiliza la asociación y revisión ya sincronizadas', async () => {
  const test = await setup()
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  test.put.mockImplementation(async () => {
    await pending
    test.mutateEvidence(true)
  })
  await act(async () => {
    const upload = test.editor().capture(photo, 1)
    const save = test.editor().save()
    release()
    await Promise.all([upload, save])
  })
  expect(test.save.mock.calls.map((call) => call[1].revision)).toEqual([8, 9])
  expect(
    test.save.mock.calls.every((call) => call[1].answers[0].evidenceIds.includes(photo.id)),
  ).toBe(true)
  expect(test.server().revision).toBe(10)
  expect(test.editor().conflict).toBe(false)
})

it.each(['completed', 'pending_approval', 'correction_required'] as const)(
  'conserva %s devuelto por backend para el mensaje de envío',
  async (status) => {
    const test = await setup()
    vi.spyOn(test.repos.visits, 'complete').mockResolvedValue({
      ...test.server(),
      status,
      phase: 'results',
    })
    await act(async () => {
      await test.editor().confirmFinish()
    })
    expect(test.editor().step).toEqual({ kind: 'success', status })
  },
)
