/** Solo presentación: conserva los segundos originales y no limita duraciones históricas. */
export function displayDuration(seconds?: number | null): string {
  if (seconds == null) return 'Sin registrar'
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(Math.floor(seconds)))
    return 'Duración no válida (registro histórico)'
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60
  return [hours ? `${hours} h` : '', hours || minutes ? `${minutes} min` : '', `${rest} s`]
    .filter(Boolean)
    .join(' ')
}
