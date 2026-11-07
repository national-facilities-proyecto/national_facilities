// This worker caches only build-generated, same-origin viewer assets. Never tiles/API/HTML.
export const CACHE_PREFIX = 'nf-map-assets-'
export const MAX_AGE = 7 * 24 * 60 * 60 * 1000
export const MAX_ENTRIES = 100
export const MAX_BYTES = 10 * 1024 * 1024
const SAVED_AT = 'x-nf-map-saved-at'
const SIZE = 'x-nf-map-bytes'

export type AssetConfig = { assets: string[]; version: string }
type Dependencies = {
  storage: CacheStorage
  fetcher: typeof fetch
  origin: string
  now(): number
  maxAge?: number
  maxEntries?: number
  maxBytes?: number
}

export class MapAssetCache {
  readonly name: string
  private readonly allowed: Set<string>
  private queue: Promise<unknown> = Promise.resolve()
  private readonly deps: Dependencies
  constructor(config: AssetConfig, deps: Dependencies) {
    this.deps = deps
    this.name = CACHE_PREFIX + config.version
    this.allowed = new Set(config.assets.map((path) => new URL(path, deps.origin).href))
  }
  accepts(request: Request) {
    const url = new URL(request.url)
    return (
      request.method === 'GET' &&
      request.cache !== 'no-store' &&
      !request.headers.has('authorization') &&
      url.origin === this.deps.origin &&
      !url.search &&
      !url.hash &&
      this.allowed.has(url.href)
    )
  }
  handle(request: Request): Promise<Response> {
    if (!this.accepts(request)) return this.deps.fetcher(request)
    const result = this.queue.then(() => this.readOrFetch(request))
    // Serialize cache mutations across concurrent requests to enforce both limits.
    this.queue = result.catch(() => undefined)
    return result
  }
  private async readOrFetch(request: Request) {
    // Build-hashed static assets have one decoded representation. Normalize the
    // key so module/CSS/fetch Origin headers do not create Vary: Origin misses,
    // and never persist request headers from the browser.
    const keyRequest = new Request(request.url)
    let cache: Cache | undefined
    try {
      cache = await this.deps.storage.open(this.name)
      const entries: { request: Request; size: number }[] = []
      let total = 0
      for (const key of await cache.keys()) {
        const saved = await cache.match(key)
        const stamp = Number(saved?.headers.get(SAVED_AT))
        const size = Number(saved?.headers.get(SIZE))
        const age = this.deps.now() - stamp
        if (
          !saved ||
          !saved.headers.has(SAVED_AT) ||
          !saved.headers.has(SIZE) ||
          !Number.isFinite(stamp) ||
          !Number.isFinite(size) ||
          size < 0 ||
          age < 0 ||
          age >= (this.deps.maxAge ?? MAX_AGE) ||
          !this.accepts(key)
        ) {
          await cache.delete(key)
        } else {
          entries.push({ request: key, size })
          total += size
        }
      }
      while (
        entries.length > (this.deps.maxEntries ?? MAX_ENTRIES) ||
        total > (this.deps.maxBytes ?? MAX_BYTES)
      ) {
        const oldest = entries.shift()!
        await cache.delete(oldest.request)
        total -= oldest.size
      }
      const hit = await cache.match(keyRequest)
      // Reads do not rewrite entries or extend their absolute lifetime.
      if (hit) return hit
    } catch {
      // Unsupported/denied storage must not stop a successful network response.
      cache = undefined
    }
    const response = await this.fetchWithTimeout(request)
    const type = response.headers.get('content-type') ?? ''
    if (
      cache &&
      response.status === 200 &&
      /(?:javascript|text\/css)/i.test(type) &&
      !/no-store|private/i.test(response.headers.get('cache-control') ?? '')
    ) {
      try {
        const body = await response.clone().arrayBuffer()
        const limit = this.deps.maxBytes ?? MAX_BYTES
        if (body.byteLength <= limit && (this.deps.maxEntries ?? MAX_ENTRIES) > 0) {
          const keys = [...(await cache.keys())]
          let bytes = 0
          const sizes = new Map<string, number>()
          for (const key of keys) {
            const size = Number((await cache.match(key))?.headers.get(SIZE) ?? 0)
            sizes.set(key.url, size)
            bytes += size
          }
          while (
            keys.length &&
            (keys.length >= (this.deps.maxEntries ?? MAX_ENTRIES) ||
              bytes + body.byteLength > limit)
          ) {
            const oldest = keys.shift()!
            await cache.delete(oldest)
            bytes -= sizes.get(oldest.url) ?? 0
          }
          const headers = new Headers(response.headers)
          // Fetch already decoded Content-Encoding; do not label decoded bytes as gzip.
          headers.delete('content-encoding')
          headers.delete('content-length')
          headers.set(SAVED_AT, String(this.deps.now()))
          headers.set(SIZE, String(body.byteLength))
          await cache.put(keyRequest, new Response(body, { status: 200, headers }))
        }
      } catch {
        /* Quota/read/write errors do not invalidate the network response. */
      }
    }
    return response
  }
  private async fetchWithTimeout(request: Request) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (request.signal.aborted) abort()
    request.signal.addEventListener('abort', abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.deps.fetcher(request, { signal: controller.signal }).then(async (response) => {
          if (response.status !== 200) return response
          // Bound both response headers and body, so a stalled body cannot block the queue.
          const body = await response.arrayBuffer()
          const headers = new Headers(response.headers)
          headers.delete('content-encoding')
          headers.delete('content-length')
          return new Response(body, { status: 200, headers })
        }),
        new Promise<Response>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(new Error('Viewer asset network timeout'))
          }, 4000)
        }),
      ])
    } finally {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', abort)
    }
  }
  async activate() {
    try {
      for (const name of await this.deps.storage.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== this.name)
          await this.deps.storage.delete(name)
      }
    } catch {
      /* Storage unavailable: continue with network. */
    }
  }
}

declare const __MAP_ASSET_CONFIG__: AssetConfig
type WorkerScope = {
  location: Location
  caches: CacheStorage
  fetch: typeof fetch
  clients: { claim(): Promise<void> }
  addEventListener(
    type: 'activate',
    callback: (event: { waitUntil(promise: Promise<unknown>): void }) => void,
  ): void
  addEventListener(
    type: 'fetch',
    callback: (event: { request: Request; respondWith(response: Promise<Response>): void }) => void,
  ): void
}
if (typeof window === 'undefined' && typeof self !== 'undefined' && 'clients' in self) {
  const worker = self as unknown as WorkerScope
  const policy = new MapAssetCache(__MAP_ASSET_CONFIG__, {
    storage: worker.caches,
    fetcher: worker.fetch.bind(worker),
    origin: worker.location.origin,
    now: Date.now,
  })
  worker.addEventListener('activate', (event) => {
    event.waitUntil(policy.activate().then(() => worker.clients.claim()))
  })
  worker.addEventListener('fetch', (event) => {
    if (policy.accepts(event.request)) event.respondWith(policy.handle(event.request))
  })
}
