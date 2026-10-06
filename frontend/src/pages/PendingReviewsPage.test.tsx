import { beforeEach, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderPage } from '../test/render'
import { createMockRepositories } from '../test/doubles/repositories'
import { createFixtures } from '../test/doubles/fixtures'
import PendingReviewsPage from './PendingReviewsPage'
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
it('bandeja NF consume solo pendientes del backend y usa fecha de envío', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 3 })
  const general = vi.spyOn(repos.checklists, 'list')
  const date = '2026-10-05T10:00:00Z'
  vi.spyOn(repos.visits, 'pendingReviews').mockResolvedValue([
    {
      ...createFixtures().visits[0],
      id: 91,
      technicianId: 1,
      phase: 'in_review',
      status: 'pending_approval',
      submittedAt: date,
      storeSnapshot: { ...createFixtures().stores[0], name: 'Tienda pendiente V2' },
      exceptions: [
        {
          id: 5,
          type: 'location',
          scope: 'closure',
          reason: 'GPS pendiente',
          failure: 'denied',
          requestedAt: date,
        },
      ],
    },
  ])
  renderPage(<PendingReviewsPage />, repos)
  await screen.findByRole('heading', { name: 'Revisiones pendientes' })
  expect(screen.getByRole('heading', { name: 'Tienda pendiente V2' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Revisar' })).toHaveAttribute(
    'href',
    '/technical-supervisor/checklists/91',
  )
  expect(screen.getByText('GPS de cierre · Pendiente')).toBeVisible()
  expect(general).not.toHaveBeenCalled()
})
