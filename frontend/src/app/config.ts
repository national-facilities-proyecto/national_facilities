export type DataSource = 'api'
export function readConfig(env: Record<string, unknown>): { source: DataSource; apiUrl: string } {
  const source = env.VITE_DATA_SOURCE
  if (source !== undefined && source !== 'api')
    throw new Error(
      'El portal operativo requiere VITE_DATA_SOURCE=api. El modo demo no está disponible.',
    )
  const apiUrl = typeof env.VITE_API_URL === 'string' ? env.VITE_API_URL.replace(/\/$/, '') : ''
  if (!/^https?:\/\//.test(apiUrl))
    throw new Error('El modo API requiere VITE_API_URL con una URL HTTP(S) válida.')
  return { source: 'api', apiUrl }
}
