import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { renderPage } from '../../test/render'
import { createMockRepositories } from '../../test/doubles/repositories'
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
  fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'pending' } })
  expect(screen.getByText('4 incidencias')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Especialidad'), { target: { value: 'Eléctrico' } })
  expect(screen.getByText('1 incidencias')).toBeInTheDocument()
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
it('búsqueda útil, filtros desplegables y tarjeta móvil sin etiquetas de columnas redundantes', async () => {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 2 })
  const view = renderPage(<TicketList />, repos)
  await screen.findByLabelText('Buscar incidencias')
  const filters = screen.getByRole('button', { name: 'Filtros' })
  expect(filters).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(filters)
  expect(filters).toHaveAttribute('aria-expanded', 'true')
  fireEvent.change(screen.getByLabelText('Buscar incidencias'), { target: { value: 'Luminarias' } })
  expect(screen.getByText('1 incidencias')).toBeVisible()
  expect(view.container.querySelector('.nf-ticket-card h2')).toHaveTextContent('MASS')
  expect(view.container.querySelector('.nf-ticket-card dt')).toBeNull()
  expect(view.container.querySelector('.nf-ticket-card')).toHaveTextContent('Alta')
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  expect(screen.getByLabelText('Buscar incidencias')).toHaveValue('')
})
