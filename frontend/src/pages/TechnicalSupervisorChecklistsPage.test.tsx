import { fireEvent, getDefaultNormalizer, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMockRepositories } from '../test/doubles/repositories'
import { createFixtures } from '../test/doubles/fixtures'
import { renderPage } from '../test/render'
import { displayDate } from '../utils/dates'
import { visitWorkStatus, type VisitStatus } from '../types/models'
import TechnicalSupervisorChecklistsPage from './TechnicalSupervisorChecklistsPage'
beforeEach(() => localStorage.clear())
it.each<VisitStatus>(['pending_approval', 'completed', 'available'])(
  'fecha y filtro de %s distinguen ejecución real de programación',
  async (status) => {
    const repos = createMockRepositories()
    await repos.auth.login({ kind: 'demo', userId: 3 })
    const scheduledAt = '2026-10-01T05:00:00Z'
    const startedAt = status === 'available' ? undefined : '2026-10-08T15:00:00Z'
    const completedAt = status === 'completed' ? '2026-10-09T01:00:00Z' : undefined
    vi.spyOn(repos.checklists, 'list').mockResolvedValue([
      { ...createFixtures().visits[0], id: 6, status, scheduledAt, startedAt, completedAt },
    ])
    renderPage(<TechnicalSupervisorChecklistsPage />, repos)
    await screen.findAllByRole('link', { name: 'Ver detalle' })
    expect(
      screen.getAllByText(
        getDefaultNormalizer()(
          `${startedAt ? 'Ejecutada: ' : 'Programada: '}${displayDate(startedAt ?? scheduledAt)}`,
        ),
      ),
    ).not.toHaveLength(0)
    const state = screen.getByLabelText('Estado')
    fireEvent.change(state, { target: { value: status === 'completed' ? 'pending' : 'finished' } })
    expect(screen.queryAllByRole('link', { name: 'Ver detalle' })).toHaveLength(0)
    fireEvent.change(state, { target: { value: visitWorkStatus(status) } })
    expect(screen.getAllByRole('link', { name: 'Ver detalle' })).not.toHaveLength(0)
    const filter = screen.getByLabelText('Fecha de ejecución o programación desde')
    fireEvent.change(filter, { target: { value: '2026-10-08' } })
    expect(screen.queryAllByRole('link', { name: 'Ver detalle' }).length > 0).toBe(
      Boolean(startedAt),
    )
    fireEvent.change(screen.getByLabelText('Fecha de ejecución o programación hasta'), {
      target: { value: '2026-10-08' },
    })
    expect(screen.queryAllByRole('link', { name: 'Ver detalle' }).length > 0).toBe(
      Boolean(startedAt),
    )
    fireEvent.change(filter, { target: { value: '2026-10-09' } })
    expect(screen.queryAllByRole('link', { name: 'Ver detalle' })).toHaveLength(0)
  },
)
