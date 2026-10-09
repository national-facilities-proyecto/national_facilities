export const gpsMessages: Record<string, string> = {
  denied: 'Permite el acceso a tu ubicación o solicita una excepción.',
  timeout: 'No pudimos obtener tu ubicación a tiempo.',
  unavailable: 'Tu dispositivo no pudo obtener la ubicación.',
  out_of_radius: 'Tu ubicación está fuera del área del establecimiento.',
  outside: 'Tu ubicación está fuera del área del establecimiento.',
  low_accuracy: 'La ubicación no es suficientemente precisa. Intenta en un lugar con mejor señal.',
  inaccurate: 'La ubicación no es suficientemente precisa. Intenta en un lugar con mejor señal.',
  stale: 'La ubicación caducó. Vuelve a intentarlo o solicita una excepción.',
  future: 'No pudimos confirmar la fecha de la ubicación. Vuelve a intentarlo.',
}
export function gpsFailureMessage(code?: string): string {
  return code ? (gpsMessages[code] ?? 'No se pudo confirmar la ubicación.') : 'Sin causa registrada'
}
export function displayMeters(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return 'Sin registrar'
  return `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(value)} m`
}
