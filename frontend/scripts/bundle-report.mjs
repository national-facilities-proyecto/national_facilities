import { readdir, readFile, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
const files = await readdir(new URL('../dist/assets/', import.meta.url))
const rows = await Promise.all(
  files.map(async (name) => {
    const buffer = await readFile(new URL(`../dist/assets/${name}`, import.meta.url))
    return { file: name, bytes: buffer.length, gzipBytes: gzipSync(buffer).length }
  }),
)
rows.sort((left, right) => right.bytes - left.bytes)
const report = {
  generatedAt: new Date().toISOString(),
  note: 'Tamaños de artefactos. No equivalen al tráfico inicial ni a métricas Lighthouse.',
  assets: rows,
}
await writeFile(
  new URL('../docs/bundle-report.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
)
console.log(rows.slice(0, 6))
