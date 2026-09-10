import { useEffect, useState } from 'react'
export function useObjectUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let active = true
    const next = blob ? URL.createObjectURL(blob) : undefined
    queueMicrotask(() => {
      if (active) setUrl(next)
    })
    return () => {
      active = false
      if (next) URL.revokeObjectURL(next)
    }
  }, [blob])
  return url
}
