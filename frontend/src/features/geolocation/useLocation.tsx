import { useCallback, useEffect, useRef } from 'react'
import type { Coordinates } from '../../types/models'
import { requestLocation } from './location'

export function useLocationRequest() {
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const request = useCallback(async () => {
    controller.current?.abort()
    controller.current = new AbortController()
    const coordinates: Coordinates = await requestLocation(controller.current.signal)
    return coordinates
  }, [])
  return { request }
}
