/**
 * Anti-Corruption Layer para el proveedor externo de mapas.
 * Aísla el contrato de coordenadas del dominio respecto a Leaflet/OpenFreeMap.
 * No envía credenciales ni datos de los usuarios al proveedor de tiles.
 */
export type ProviderLatLng = [latitude: number, longitude: number]

export function toProviderLatLng(location: {
  latitude: unknown
  longitude: unknown
}): ProviderLatLng | null {
  const { latitude, longitude } = location
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return [latitude, longitude]
}
