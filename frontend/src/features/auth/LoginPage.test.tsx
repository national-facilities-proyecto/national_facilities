import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'
import { renderPage } from '../../test/render'
import { createHttpRepositories } from '../../services/adapters/httpRepositories'
import { createMockRepositories } from '../../mocks/repositories'
import { canAccess, normalizeRole, validSession } from './session'
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
it('muestra validaciones accesibles al enviar login API vacío', async () => {
  renderPage(<LoginPage />, createHttpRepositories('http://localhost/api'))
  fireEvent.click(await screen.findByRole('button', { name: 'Iniciar sesión' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ingresa tu usuario y contraseña.')
})
it('normaliza roles conocidos y falla cerrado con rol desconocido o nulo', async () => {
  const repos = createMockRepositories()
  const session = await repos.auth.login({ kind: 'demo', userId: 1 })
  expect(normalizeRole('Técnico')).toBe('technician')
  expect(normalizeRole('Supervisor de cuenta')).toBe('account_supervisor')
  expect(normalizeRole('otro')).toBeNull()
  expect(validSession({ ...session, user: { ...session.user, role: null } })).toBe(false)
  expect(canAccess(session, ['technician'])).toBe(true)
  expect(canAccess(session, ['administrator'])).toBe(false)
  expect(canAccess({ ...session, expiresAt: 0 }, ['technician'])).toBe(false)
})
it('rechaza cuentas demo inválidas y credenciales en modo mock', async () => {
  const repos = createMockRepositories()
  await expect(repos.auth.login({ kind: 'demo', userId: 999 })).rejects.toMatchObject({
    code: 'unauthorized',
  })
  await expect(
    repos.auth.login({ kind: 'credentials', username: 'invalid', password: 'invalid' }),
  ).rejects.toMatchObject({ code: 'validation' })
})
it('restaura sesión y logout conserva claves de otras aplicaciones', async () => {
  const repos = createMockRepositories()
  sessionStorage.setItem('other-app', 'keep')
  const session = await repos.auth.login({ kind: 'demo', userId: 1 })
  expect((await repos.auth.restore())?.user.id).toBe(session.user.id)
  await repos.auth.changePassword('not-persisted')
  expect((await repos.auth.restore())?.user.passwordInitialized).toBe(true)
  expect(localStorage.getItem('nf:mock:v1')).not.toContain('not-persisted')
  await repos.auth.logout()
  expect(await repos.auth.restore()).toBeNull()
  expect(sessionStorage.getItem('other-app')).toBe('keep')
})
it('no autoriza tokens de Django sin contrato de usuario', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access: 'a', refresh: 'r' }), { status: 200 }),
      ),
  )
  const repos = createHttpRepositories('http://localhost/api')
  await expect(
    repos.auth.login({ kind: 'credentials', username: 'user', password: 'password' }),
  ).rejects.toMatchObject({ code: 'not_implemented' })
  expect(sessionStorage.getItem('nf:session:api:v1')).toBeNull()
  vi.unstubAllGlobals()
})
