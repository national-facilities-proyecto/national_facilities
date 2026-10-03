export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function dayOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${localDate(date)}T10:00:00`
}
export function dateBucket(value: string, today = new Date()): 'late' | 'today' | 'future' {
  const day = operationDate(new Date(value))
  const current = operationDate(today)
  return day < current ? 'late' : day > current ? 'future' : 'today'
}
export function displayDate(value?: string): string {
  if (!value) return 'Sin registrar'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no válida'
    : new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Lima',
      }).format(date)
}
export function localDateTime(value: string): string {
  const date = new Date(value)
  return `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
export function operationDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function inDateRange(value: string, from: string, to: string): boolean {
  const date = operationDate(new Date(value))
  return (!from || date >= from) && (!to || date <= to)
}
