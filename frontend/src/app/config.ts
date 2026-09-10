export type DataSource = 'mock' | 'api'
export function readConfig(env: Record<string, unknown>): { source: DataSource; apiUrl: string } {
  const source = env.VITE_DATA_SOURCE
  if (source !== 'mock' && source !== 'api')
    throw new Error('Configura VITE_DATA_SOURCE=mock o api en frontend/.env.local y reinicia Vite.')
  const apiUrl = typeof env.VITE_API_URL === 'string' ? env.VITE_API_URL.replace(/\/$/, '') : ''
  if (source === 'api' && !/^https?:\/\//.test(apiUrl))
    throw new Error('El modo API requiere VITE_API_URL con una URL HTTP(S) válida.')
  return { source, apiUrl }
}
