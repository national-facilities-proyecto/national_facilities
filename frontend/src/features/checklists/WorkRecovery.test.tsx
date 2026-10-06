import { beforeEach, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderPage } from '../../test/render'
import { createMockRepositories } from '../../test/doubles/repositories'
import { createFixtures } from '../../test/doubles/fixtures'
import { WorkRecovery } from './WorkRecovery'
import { AppError } from '../../services/errors'
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
for (const phase of ['physical_work', 'physical_finished', 'results'] as const)
  it(`recupera ${phase} en la misma ejecución`, async () => {
    const repos = createMockRepositories()
    await repos.auth.login({ kind: 'demo', userId: 1 })
    vi.spyOn(repos.visits, 'recovery').mockResolvedValue({
      activeExecution: {
        ...createFixtures().visits[0],
        phase,
        startedAt: new Date().toISOString(),
        storeSnapshot: createFixtures().stores[0],
      },
      reservations: [],
      corrections: [],
      inReview: [],
    })
    renderPage(<WorkRecovery />, repos)
    await screen.findByRole('heading', { name: 'Tienes un trabajo en curso' })
    expect(screen.getByRole('link', { name: 'Continuar trabajo' })).toHaveAttribute(
      'href',
      '/checklists/1/start',
    )
  })
it('reservas/corrección/revisión se muestran distintas y sin ocupación falsa', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  const base = createFixtures().visits[0]
  vi.spyOn(repos.visits, 'recovery').mockResolvedValue({
    reservations: [{ ...base, phase: 'reserved', claimExpiresAt: new Date().toISOString() }],
    corrections: [
      { ...base, id: 2, phase: 'correction_required', startedAt: new Date().toISOString() },
    ],
    inReview: [{ ...base, id: 3, phase: 'in_review', startedAt: new Date().toISOString() }],
  })
  renderPage(<WorkRecovery />, repos)
  await screen.findByRole('heading', { name: 'Pendiente de iniciar' })
  expect(screen.getByRole('heading', { name: 'Corrección requerida' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'En revisión' })).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Tienes un trabajo en curso' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver registro' })).toHaveAttribute(
    'href',
    '/checklists/3/start',
  )
})
it('error de integridad se presenta explícito y no elige un trabajo', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 1 })
  vi.spyOn(repos.visits, 'recovery').mockRejectedValue(
    new AppError('conflict', 'Integridad incompatible: varias ejecuciones activas.'),
  )
  renderPage(<WorkRecovery />, repos)
  await screen.findByRole('alert')
  expect(screen.getByRole('alert')).toHaveTextContent('Integridad incompatible')
  expect(screen.queryByRole('link', { name: 'Continuar trabajo' })).not.toBeInTheDocument()
})
