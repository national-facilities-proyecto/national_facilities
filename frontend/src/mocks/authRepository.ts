import type { Repositories } from '../services/repositories/contracts'
import { AppError, required } from '../services/errors'
import { clearNfSession, validSession } from '../features/auth/session'
import { readDatabase, SESSION_KEY, writeDatabase } from './storage'
import { delay, sessionFor, saveSession, currentUser, mutate } from './runtime'

export const DEMO_PASSWORD = 'National2026!'

export function createAuthRepository(): NonNullable<Repositories['auth']> {
  return {
    async demoUsers() {
      await delay()
      return readDatabase().users.filter((user) => user.active)
    },
    async login(input) {
      await delay()
      const db = readDatabase()
      const user =
        input.kind === 'demo'
          ? db.users.find((item) => item.id === input.userId && item.active)
          : db.users.find(
              (item) =>
                item.active &&
                item.email.toLocaleLowerCase() === input.username.trim().toLocaleLowerCase() &&
                input.password === DEMO_PASSWORD,
            )
      if (!user)
        throw new AppError(
          input.kind === 'demo' ? 'unauthorized' : 'validation',
          input.kind === 'demo'
            ? 'La cuenta demo no existe.'
            : 'Usuario o contraseña incorrectos.',
        )
      clearNfSession()
      writeDatabase(db)
      return saveSession(sessionFor(user))
    },
    async restore() {
      if (!sessionStorage.getItem(SESSION_KEY)) return null
      const user = currentUser()
      const value: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY)!)
      if (!validSession(value)) throw new AppError('unauthorized', 'Sesión no válida.')
      return saveSession({ ...value, user })
    },
    async logout() {
      clearNfSession()
    },
    async changePassword(password) {
      required(password.length >= 8, 'Usa al menos 8 caracteres.')
      const user = await mutate((db) => {
        const user = currentUser(db)
        user.passwordInitialized = true
        return user
      })
      return saveSession(sessionFor(user))
    },
  }
}
