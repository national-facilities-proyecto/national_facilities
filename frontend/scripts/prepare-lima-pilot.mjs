// Offline conversion of a bounded OSM Overpass extract; never downloads tiles/data.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'

const [input, output] = process.argv.slice(2)
if (!input || !output)
  throw new Error('Usage: node scripts/prepare-lima-pilot.mjs <overpass.json> <pilot.geojson>')
const raw = await readFile(input)
const source = JSON.parse(raw)
if (source.remark || !source.elements?.length || !source.osm3s?.timestamp_osm_base)
  throw new Error('Incomplete OSM response')
const coverage = [-77.11, -12.27, -76.9, -12.04]
const point = (p) => [p.lon, p.lat]
const same = (a, b) => a[0] === b[0] && a[1] === b[1]
function rings(members) {
  const pending = members.filter((m) => m.type === 'way').map((m) => m.geometry?.map(point))
  if (!pending.length || pending.some((line) => !line || line.length < 2))
    throw new Error('Missing boundary members')
  const result = []
  while (pending.length) {
    let ring = pending.shift()
    while (!same(ring[0], ring.at(-1))) {
      const index = pending.findIndex(
        (line) => same(ring.at(-1), line[0]) || same(ring.at(-1), line.at(-1)),
      )
      if (index < 0) throw new Error('Unclosed OSM boundary: do not invent connecting segments')
      const next = pending.splice(index, 1)[0]
      if (!same(ring.at(-1), next[0])) next.reverse()
      ring = ring.concat(next.slice(1))
    }
    let area = 0
    for (let i = 1; i < ring.length; i++)
      area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
    if (area < 0) ring.reverse() // RFC 7946 outer ring orientation; no coordinate invention.
    result.push(ring)
  }
  return result
}
const features = []
for (const relation of source.elements.filter((e) => e.type === 'relation')) {
  if (relation.members.some((m) => m.role === 'inner'))
    throw new Error('Review holes before exporting this source')
  const boundaries = rings(relation.members.filter((m) => m.role === 'outer'))
  features.push({
    type: 'Feature',
    id: `relation/${relation.id}`,
    properties: {
      kind: 'district',
      name: relation.tags.name,
      osmId: relation.id,
    },
    geometry: { type: 'MultiPolygon', coordinates: boundaries.map((ring) => [ring]) },
  })
}
// Preserve source coordinates. Combine named road segments without joining or inventing roads.
const roads = new Map()
for (const way of source.elements.filter((e) => e.type === 'way' && e.tags?.name)) {
  if (!['motorway', 'trunk', 'primary'].includes(way.tags.highway) || !way.geometry?.length)
    continue
  const key = JSON.stringify([way.tags.highway, way.tags.name])
  if (!roads.has(key))
    roads.set(key, { name: way.tags.name, highway: way.tags.highway, ids: [], lines: [] })
  const road = roads.get(key)
  road.ids.push(way.id)
  road.lines.push(way.geometry.map(point))
}
for (const road of roads.values())
  features.push({
    type: 'Feature',
    properties: {
      kind: 'road',
      name: road.name,
      highway: road.highway,
      osmWayIds: road.ids,
    },
    geometry: { type: 'MultiLineString', coordinates: road.lines },
  })
if (features.filter((f) => f.properties.kind === 'district').length !== 7 || !roads.size)
  throw new Error('Unexpected pilot composition')
const result = {
  type: 'FeatureCollection',
  metadata: {
    version: 'lima-sur-osm-2026-11-07-v1',
    retrievedAt: '2026-11-07',
    source: 'OpenStreetMap contributors via https://overpass-api.de/api/interpreter',
    sourceTimestamp: source.osm3s.timestamp_osm_base,
    sourceSha256: createHash('sha256').update(raw).digest('hex'),
    license: 'ODbL-1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: '© OpenStreetMap contributors',
    coverage,
  },
  features,
}
const body = JSON.stringify(result) + '\n'
if (Buffer.byteLength(body) > 1024 * 1024) throw new Error('Pilot exceeds the 1 MiB release budget')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, body)
console.log(
  JSON.stringify(
    {
      bytes: Buffer.byteLength(body),
      districts: 7,
      roadGroups: roads.size,
      features: features.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      metadata: result.metadata,
    },
    null,
    2,
  ),
)
