import { fireEvent, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ChecklistTaskCard } from './ChecklistTaskCard'
import { renderPage } from '../test/render'
const task = { id: 4, title: 'Revisar filtro', photoRequired: true, active: true, order: 1 }
it('permite seleccionar conforme y no conforme y distingue foto obligatoria', () => {
  const conform = vi.fn()
  const non = vi.fn()
  renderPage(
    <ChecklistTaskCard
      task={task}
      order={1}
      onConforming={conform}
      onNonConforming={non}
      onCamera={vi.fn()}
      onRemove={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '✓ Conforme' }))
  fireEvent.click(screen.getByRole('button', { name: '! No conforme' }))
  expect(conform).toHaveBeenCalled()
  expect(non).toHaveBeenCalled()
  expect(screen.getByText('Foto obligatoria')).toBeInTheDocument()
})
it('muestra foto opcional y observación asociada a la tarea', () => {
  renderPage(
    <ChecklistTaskCard
      task={{ ...task, photoRequired: false }}
      order={1}
      answer={{ taskId: 4, result: 'no_conforme', observation: 'Filtro dañado', evidenceIds: [] }}
      onConforming={vi.fn()}
      onNonConforming={vi.fn()}
      onCamera={vi.fn()}
      onRemove={vi.fn()}
    />,
  )
  expect(screen.getByText('Foto opcional')).toBeInTheDocument()
  expect(screen.getByText(/Filtro dañado/)).toBeInTheDocument()
})
