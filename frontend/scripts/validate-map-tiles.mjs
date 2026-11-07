import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'
import Pbf from 'pbf'
import { VectorTile } from 'vector-tile'

// Offline validation before publishing; never requests a public tile service.
const directory = process.argv[2]
if (!directory)
  throw new Error('Usage: node scripts/validate-map-tiles.mjs <XYZ release directory>')
const root = resolve(directory)
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
const layers = new Set()
let count = 0
let empty = 0
async function inspect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, entry.name)
    if (entry.isDirectory()) await inspect(file)
    else if (entry.name.endsWith('.pbf')) {
      if (!/^\d+[\\/]\d+[\\/]\d+\.pbf$/.test(relative(root, file)))
        throw new Error(`Invalid XYZ path: ${file}`)
      const bytes = gunzipSync(await readFile(file))
      if (!bytes.length) empty++
      const tile = new VectorTile(new Pbf(bytes))
      for (const [name, layer] of Object.entries(tile.layers)) {
        layers.add(name)
        for (let i = 0; i < layer.length; i++) layer.feature(i).loadGeometry()
      }
      count++
    }
  }
}
await inspect(root)
if (count !== manifest.tiles) throw new Error(`Incomplete release: ${count}/${manifest.tiles}`)
if (!layers.has('transportation') || !layers.has('water'))
  throw new Error(
    'Pilot must contain actual transportation and water layers; review sources and geometry',
  )
console.log(
  JSON.stringify(
    {
      tiles: count,
      emptyTiles: empty,
      layers: [...layers].sort(),
      note: 'Offline parsing only; verify visual styles and AWS separately.',
    },
    null,
    2,
  ),
)
