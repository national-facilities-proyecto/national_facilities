import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { createOpenFreeMapLayer, createVectorMapLayer } from './openFreeMap'
import { getMapProviders, type MapProvider } from './mapProviders'
import type { VectorMapLayer } from './vectorTileTransport'

const configuredProviders = getMapProviders()

export function MapBaseLayer({
  onReady,
  onError,
  onLoading,
  timeoutMs = 12000,
  providers = configuredProviders,
}: {
  onReady(this: void, provider: MapProvider): void
  onError(this: void, message: string): void
  onLoading?(this: void, provider: MapProvider): void
  timeoutMs?: number
  providers?: readonly MapProvider[]
}) {
  const map = useMap()
  useEffect(() => {
    let disposed = false
    let release: (() => void) | undefined

    const start = (index: number) => {
      const provider = providers[index]
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
        if (index + 1 < providers.length) start(index + 1)
        else onError(message)
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
          return provider.id === 'openfreemap'
            ? createOpenFreeMapLayer()
            : createVectorMapLayer(provider)
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
    if (providers.length) start(0)
    else onError('No hay proveedores cartográficos configurados.')
    return () => {
      disposed = true
      release?.()
    }
  }, [map, onError, onReady, onLoading, timeoutMs, providers])
  return null
}
