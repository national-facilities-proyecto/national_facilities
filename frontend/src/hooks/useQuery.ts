import { useCallback, useEffect, useState } from 'react'
export function useQuery<T>(load: (signal: AbortSignal) => Promise<T>, reactive = true) {
  const [state, setState] = useState<{
    status: 'loading' | 'success' | 'error'
    data?: T
    error?: unknown
  }>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void Promise.resolve().then(() => {
      if (active) setState({ status: 'loading' })
    })
    void load(controller.signal).then(
      (data) => {
        if (active) setState({ status: 'success', data })
      },
      (error) => {
        if (active && !controller.signal.aborted) setState({ status: 'error', error })
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
    return () => {
      window.removeEventListener('nf:data', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [reload, reactive])
  return { ...state, reload }
}
