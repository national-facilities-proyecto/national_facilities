export type MapProvider = {
  id: 'openfreemap'
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
