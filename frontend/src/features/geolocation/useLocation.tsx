import { useCallback, useEffect, useRef } from 'react'
import { useRepositories } from '../../app/RepositoriesProvider'
import type { Coordinates, Store } from '../../types/models'
import { requestLocation } from './location'

const mockLocationOffset = 0.00025

export function useLocationRequest(store: Store) {
  const { source } = useRepositories()
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const request = useCallback(async () => {
    controller.current?.abort()
    controller.current = new AbortController()
    let coordinates: Coordinates
    if (source === 'mock') {
      coordinates = {
        latitude: store.latitude + mockLocationOffset,
        longitude: store.longitude + mockLocationOffset,
        accuracy: 8,
        capturedAt: Date.now(),
      }
    } else coordinates = await requestLocation(controller.current.signal)
    return coordinates
  }, [source, store.latitude, store.longitude])
  return { request }
}
