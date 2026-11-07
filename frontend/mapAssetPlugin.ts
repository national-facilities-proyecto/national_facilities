import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import type { Plugin } from 'vite'

export function mapAssetPlugin(): Plugin {
  let base = '/'
  return {
    name: 'national-facilities-map-assets',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    async generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((name) =>
          /^(?:assets\/)(?:AssignedLocationsMap|LazyMap|Leaflet\.VectorGrid)[^/]*\.(?:js|css)$/.test(
            name,
          ),
        )
        .sort()
        .map((name) => base + name)
      const source = await readFile(
        new URL('./src/features/technician/mapAssetWorker.ts', import.meta.url),
        'utf8',
      )
      const version = createHash('sha256')
        .update(source)
        .update(JSON.stringify(assets))
        .digest('hex')
        .slice(0, 16)
      const compiled = ts
        .transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
        })
        .outputText.replaceAll('__MAP_ASSET_CONFIG__', JSON.stringify({ assets, version }))
      this.emitFile({ type: 'asset', fileName: 'map-assets-sw.js', source: compiled })
    },
  }
}
