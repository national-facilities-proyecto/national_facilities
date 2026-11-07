export type MapProvider = {
  id: 'openfreemap' | 'aws'
  name: string
  url: string
  attribution: string
}

const dataAttribution =
  '<a href="https://openmaptiles.org/">© OpenMapTiles</a> | ' +
  '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>'

export const openFreeMapProvider: MapProvider = {
  id: 'openfreemap',
  name: 'OpenFreeMap',
  url: 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf',
  attribution: `<a href="https://openfreemap.org/">OpenFreeMap</a> | ${dataAttribution}`,
}

// Un endpoint inválido deshabilita solo el respaldo; el principal sigue disponible.
export function getMapProviders(awsUrl: unknown = import.meta.env.VITE_AWS_MAP_TILES_URL) {
  const providers = [openFreeMapProvider]
  const template = typeof awsUrl === 'string' ? awsUrl.trim() : ''
  if (!template) return providers
  try {
    const url = new URL(template)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/\/\{z\}\/\{x\}\/\{y\}\.pbf$/.test(template)
    )
      return providers
    providers.push({
      id: 'aws',
      name: 'AWS',
      url: template,
      attribution: `Cartografía propia | ${dataAttribution}`,
    })
  } catch {
    // No exponer el valor configurado, que podría contener credenciales por error.
  }
  return providers
}
