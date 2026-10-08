import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { TicketDetail } from './TicketDetail'
import { renderPage } from '../../test/render'
import { createMockRepositories } from '../../test/doubles/repositories'
import { operationDate } from '../../utils/dates'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
it('programa hoy mediante una fecha ISO sin hora del dispositivo', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 3 })
  const schedule = vi.spyOn(repos.tickets, 'schedule')
  renderPage(<TicketDetail id={104} account />, repos)
  const date = await screen.findByLabelText('Fecha de atención')
  expect(date).toHaveAttribute('type', 'date')
  expect(date).toHaveValue(operationDate())
  expect(screen.queryByLabelText('Fecha y hora de visita')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Técnico asignado'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Programar visita' }))
  await waitFor(() =>
    expect(schedule).toHaveBeenCalledWith(104, 1, operationDate(), 'Media', '', undefined),
  )
  await screen.findByRole('button', { name: 'Guardar reprogramación' })
})
it('MASS ve reporte y seguimiento sin programación ni revisión', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 2 })
  renderPage(<TicketDetail id={104} />, repos)
  await screen.findByRole('heading', { name: 'Reporte original' })
  expect(screen.queryByLabelText('Técnico asignado')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Revisar excepción/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Resolución del técnico' })).not.toBeInTheDocument()
  expect(screen.getByText('El técnico aún no ha enviado la resolución.')).toBeVisible()
})
