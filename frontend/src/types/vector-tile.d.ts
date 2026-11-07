// Contrato mínimo de los decodificadores ya usados por Leaflet.VectorGrid 1.3.0.
declare module 'pbf' {
  export default class Pbf {
    constructor(buffer: Uint8Array)
  }
}

declare module 'vector-tile' {
  import Pbf from 'pbf'
  type Feature = {
    geometry?: unknown
    loadGeometry(): unknown
  }
  export class VectorTile {
    constructor(pbf: Pbf)
    layers: Record<
      string,
      {
        length: number
        feature(index: number): Feature
        features?: Feature[]
      }
    >
  }
}
