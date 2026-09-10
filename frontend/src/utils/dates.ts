export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function dayOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${localDate(date)}T10:00:00`
}
export function dateBucket(value: string, today = new Date()): 'late' | 'today' | 'future' {
  const day = localDate(new Date(value))
  const current = localDate(today)
  return day < current ? 'late' : day > current ? 'future' : 'today'
}
export function displayDate(value?: string): string {
  if (!value) return 'Sin registrar'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no válida'
    : new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
export function inDateRange(value: string, from: string, to: string): boolean {
  const date = localDate(new Date(value))
  return (!from || date >= from) && (!to || date <= to)
}
