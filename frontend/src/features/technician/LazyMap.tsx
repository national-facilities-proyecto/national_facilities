import { lazy, Suspense } from 'react'
import type { Store } from '../../types/models'
import { LoadingState } from '../../components/ui'
import { ErrorBoundary } from '../../components/feedback/ErrorBoundary'
const Map = lazy(async () => ({
  default: (await import('./AssignedLocationsMap')).AssignedLocationsMap,
}))
export function LazyMap(props: { stores: Store[]; onSelect?: (store: Store) => void }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingState />}>
        <Map {...props} />
      </Suspense>
    </ErrorBoundary>
  )
}
