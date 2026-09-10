export type ErrorCode =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'network'
  | 'not_implemented'
  | 'storage'
  | 'location'
export class AppError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'AppError'
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof AppError
    ? error.message
    : 'No se pudo completar la operación. Inténtalo nuevamente.'
}
export function required(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError('validation', message)
}
