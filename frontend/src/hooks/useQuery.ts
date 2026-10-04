import { useCallback, useEffect, useState } from 'react'
import { AppError } from '../services/errors'
export function useQuery<T>(load: (signal: AbortSignal) => Promise<T>, reactive = true) {
  const [state, setState] = useState<{
    source: typeof load
    status: 'loading' | 'success' | 'error'
    data?: T
    error?: unknown
    refreshing: boolean
    refreshError?: unknown
  }>({ source: load, status: 'loading', refreshing: false })
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void Promise.resolve().then(() => {
      if (active)
        setState((current) =>
          current.source === load && current.status === 'success'
            ? { ...current, refreshing: true, refreshError: undefined }
            : { source: load, status: 'loading', refreshing: false },
        )
    })
    void load(controller.signal).then(
      (data) => {
        if (active) setState({ source: load, status: 'success', data, refreshing: false })
      },
      (error) => {
        if (active && !controller.signal.aborted)
          setState((current) =>
            current.source === load &&
            current.status === 'success' &&
            error instanceof AppError &&
            error.code === 'network'
              ? { ...current, refreshing: false, refreshError: error }
              : { source: load, status: 'error', error, refreshing: false },
          )
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [load, revision])
  useEffect(() => {
    if (!reactive) return
    const refresh = () => reload()
    window.addEventListener('nf:data', refresh)
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    const timer = window.setInterval(refresh, 30000)
    return () => {
      window.removeEventListener('nf:data', refresh)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      window.clearInterval(timer)
    }
  }, [reload, reactive])
  // Un filtro/recurso distinto nunca recibe los datos de la consulta anterior.
  if (state.source !== load)
    return {
      status: 'loading' as const,
      refreshing: false,
      data: undefined,
      error: undefined,
      refreshError: undefined,
      reload,
    }
  return {
    status: state.status,
    data: state.data,
    error: state.error,
    refreshing: state.refreshing,
    refreshError: state.refreshError,
    reload,
  }
}
