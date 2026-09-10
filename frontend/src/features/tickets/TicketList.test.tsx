import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { renderPage } from '../../test/render'
import { createMockRepositories } from '../../mocks/repositories'
import { dayOffset } from '../../utils/dates'
import { TicketList } from './TicketList'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

it('combina filtros de incidencia, recupera el listado y filtra fechas locales', async () => {
  const repos = createMockRepositories()
  repos.demo!.setScenario('normal')
  await repos.auth.login({ kind: 'demo', userId: 3 })
  renderPage(<TicketList account />, repos)
  expect(await screen.findByText('4 incidencias')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'open' } })
  expect(screen.getByText('1 incidencias')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Especialidad'), { target: { value: 'Eléctrico' } })
  expect(screen.getByText('0 incidencias')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  expect(screen.getByText('4 incidencias')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Fecha inicio'), {
    target: { value: dayOffset(1).slice(0, 10) },
  })
  expect(screen.getByText('0 incidencias')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  fireEvent.change(screen.getByLabelText('Tienda'), { target: { value: '2' } })
  expect(screen.getByText('1 incidencias')).toBeInTheDocument()
})
