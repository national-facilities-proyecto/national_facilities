import { useSyncExternalStore } from 'react'
import type { Coordinates } from '../types/domain'

let currentLocation: Coordinates | null = null
const listeners = new Set<() => void>()

export function getTechnicianLocation(): Coordinates | null { return currentLocation }
export function setTechnicianLocation(location: Coordinates | null): void { currentLocation = location; listeners.forEach((listener) => listener()) }
export function subscribeTechnicianLocation(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener) }
export function useTechnicianLocation(): Coordinates | null { return useSyncExternalStore(subscribeTechnicianLocation, getTechnicianLocation, getTechnicianLocation) }
