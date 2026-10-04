import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useQuery } from './useQuery'
import { AppError } from '../services/errors'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (cause: unknown) => void = () => {}
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('mantiene la vista montada mientras refresca por tiempo o foco', async () => {
  const pending = deferred<string>()
  const load = vi
    .fn()
    .mockResolvedValueOnce('confirmed')
    .mockImplementation(() => pending.promise)
  const { result } = renderHook(() => useQuery(load))
  await act(async () => {})
  await act(async () => {
    vi.advanceTimersByTime(30000)
  })
  expect(result.current.status).toBe('success')
  expect(result.current.data).toBe('confirmed')
  expect(result.current.refreshing).toBe(true)
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(result.current.status).toBe('success')
  expect(result.current.data).toBe('confirmed')
  await act(async () => pending.resolve('latest'))
  expect(result.current.data).toBe('latest')
  expect(result.current.refreshing).toBe(false)
})

it('conserva datos confirmados e informa un fallo de actualización recuperable', async () => {
  const failure = new AppError('network', 'Sin conexión')
  const load = vi
    .fn()
    .mockResolvedValueOnce('confirmed')
    .mockRejectedValueOnce(failure)
    .mockResolvedValue('latest')
  const { result } = renderHook(() => useQuery(load))
  await act(async () => {})
  await act(async () => result.current.reload())
  expect(result.current.status).toBe('success')
  expect(result.current.data).toBe('confirmed')
  expect(result.current.refreshError).toBe(failure)
  await act(async () => result.current.reload())
  expect(result.current.data).toBe('latest')
  expect(result.current.refreshError).toBeUndefined()
})

it('retira datos cuando el servidor revoca permisos', async () => {
  const load = vi
    .fn()
    .mockResolvedValueOnce('confirmed')
    .mockRejectedValue(new AppError('forbidden', 'Acceso retirado'))
  const { result } = renderHook(() => useQuery(load))
  await act(async () => {})
  await act(async () => result.current.reload())
  expect(result.current.status).toBe('error')
  expect(result.current.data).toBeUndefined()
})

it('no mezcla recursos ni permite que una respuesta antigua sobrescriba la consulta nueva', async () => {
  const previous = deferred<string>()
  const current = deferred<string>()
  const first = vi.fn(() => previous.promise)
  const second = vi.fn(() => current.promise)
  const { result, rerender } = renderHook(({ load }) => useQuery(load), {
    initialProps: { load: first },
  })
  await act(async () => {})
  rerender({ load: second })
  expect(result.current.data).toBeUndefined()
  await act(async () => current.resolve('new resource'))
  await act(async () => previous.resolve('old resource'))
  expect(result.current.data).toBe('new resource')
})

it('pausa el refresco automático mientras un editor está abierto y permite recargar al cerrar', async () => {
  const load = vi.fn().mockResolvedValue('confirmed')
  const { result, rerender } = renderHook(({ reactive }) => useQuery(load, reactive), {
    initialProps: { reactive: true },
  })
  await act(async () => {})
  rerender({ reactive: false })
  await act(async () => {
    vi.advanceTimersByTime(31000)
    for (const event of ['focus', 'nf:data', 'online']) window.dispatchEvent(new Event(event))
  })
  expect(load).toHaveBeenCalledOnce()
  expect(result.current.data).toBe('confirmed')
  rerender({ reactive: true })
  await act(async () => result.current.reload())
  expect(load).toHaveBeenCalledTimes(2)
})
