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
  fireEvent.click(screen.getByRole('button', { name: 'Conforme' }))
  fireEvent.click(screen.getByRole('button', { name: 'No conforme' }))
  expect(conform).toHaveBeenCalled()
  expect(non).toHaveBeenCalled()
  expect(screen.getByText('Foto obligatoria')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Tomar foto' })).not.toBeInTheDocument()
})

it('No aplica conserva motivo sin solicitar foto aunque la plantilla la configure', () => {
  renderPage(
    <ChecklistTaskCard
      task={task}
      order={1}
      answer={{
        taskId: 4,
        result: 'no_aplica',
        observation: 'No existe filtro instalado.',
        evidenceIds: [],
      }}
      onConforming={vi.fn()}
      onNonConforming={vi.fn()}
      onCamera={vi.fn()}
      onGallery={vi.fn()}
      onRemove={vi.fn()}
    />,
  )
  expect(screen.getByText('Sin foto requerida')).toBeInTheDocument()
  expect(screen.getByText(/No existe filtro instalado/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Tomar foto' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Seleccionar de galería' })).not.toBeInTheDocument()
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

it.each([undefined, 'conforme', 'no_conforme', 'no_aplica'] as const)(
  'únicamente %s aparece seleccionado y las tres opciones tienen etiquetas sin check',
  (result) => {
    renderPage(
      <ChecklistTaskCard
        task={task}
        order={1}
        answer={
          result
            ? { taskId: 4, result, observation: 'Motivo de revisión', evidenceIds: [] }
            : undefined
        }
        onConforming={vi.fn()}
        onNonConforming={vi.fn()}
        onNotApplicable={vi.fn()}
        onCamera={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const names = { conforme: 'Conforme', no_conforme: 'No conforme', no_aplica: 'No aplica' }
    for (const [value, label] of Object.entries(names)) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toHaveAttribute('aria-pressed', String(value === result))
      expect(button.textContent).not.toContain('✓')
      expect(button).toHaveClass('nf-result-option')
    }
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(result ? 1 : 0)
  },
)
