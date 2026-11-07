import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { createOpenFreeMapLayer } from './openFreeMap'
import { openFreeMapProvider, type MapProvider } from './mapProviders'
import type { VectorMapLayer } from './vectorTileTransport'

export function MapBaseLayer({
  onReady,
  onError,
  onLoading,
  timeoutMs = 12000,
}: {
  onReady(this: void, provider: MapProvider): void
  onError(this: void, message: string): void
  onLoading?(this: void, provider: MapProvider): void
  timeoutMs?: number
}) {
  const map = useMap()
  useEffect(() => {
    let disposed = false
    let release: (() => void) | undefined

    const start = () => {
      const provider = openFreeMapProvider
      // React Leaflet considera prefix una opción inicial. Actualizar el control
      // existente evita remontarlo y alterar su orden respecto al zoom.
      map.attributionControl?.setPrefix(provider.attribution)
      let layer: VectorMapLayer | undefined
      let failed = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const clearTimer = () => clearTimeout(timer)
      const detach = () => {
        clearTimer()
        if (!layer) return
        layer.off('loading', loading)
        layer.off('load', loaded)
        layer.off('tileerror', tileError)
        layer.dispose?.()
        layer.remove()
        layer = undefined
      }
      const fail = (message: string) => {
        if (failed || disposed) return
        failed = true
        detach()
        onError(message)
      }
      const loading = () => {
        if (failed || disposed) return
        clearTimer()
        timer = setTimeout(
          () => fail('Tiempo de espera agotado al cargar el mapa base.'),
          timeoutMs,
        )
        onLoading?.(provider)
      }
      const loaded = () => {
        clearTimer()
        if (!failed && !disposed) onReady(provider)
      }
      const tileError = () => fail('No se pudo cargar el mapa base.')
      release = detach
      loading()
      // Captura también un error síncrono al crear o instalar la capa.
      void Promise.resolve()
        .then(() => {
          if (disposed || failed) return
          return createOpenFreeMapLayer()
        })
        .then((createdLayer) => {
          if (!createdLayer) return
          if (disposed || failed) {
            createdLayer.dispose?.()
            createdLayer.remove()
            return
          }
          layer = createdLayer
          layer.on('loading', loading)
          layer.on('load', loaded)
          layer.once('tileerror', tileError)
          layer.addTo(map)
        })
        .catch(() => fail('No se pudo inicializar el mapa base.'))
    }
    start()
    return () => {
      disposed = true
      release?.()
    }
  }, [map, onError, onReady, onLoading, timeoutMs])
  return null
}
