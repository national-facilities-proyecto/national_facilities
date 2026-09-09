import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ChecklistExecutionPage from './ChecklistExecutionPage'
import * as geo from '../services/geolocationService'
import * as visits from '../services/visitService'

vi.mock('../services/geolocationService')
vi.mock('../services/visitService')
vi.mock('../features/technician/CameraModal', () => ({
  CameraModal: ({ open, onCapture }: { open: boolean; onCapture: (photo: string) => void }) => open ? <button onClick={() => onCapture('blob:test-photo')}>Confirmar captura simulada</button> : null,
}))

function page() {
  return render(
    <MemoryRouter initialEntries={['/checklists/1']}>
      <Routes><Route path="/checklists/:id" element={<ChecklistExecutionPage />} /></Routes>
    </MemoryRouter>,
  )
}

function markAllConforming() {
  screen.getAllByRole('button', { name: '✓ Conforme' }).forEach((button) => fireEvent.click(button))
}

function captureEveryRequiredPhoto() {
  while (screen.queryAllByRole('button', { name: 'Tomar foto' }).length > 0) {
    fireEvent.click(screen.getAllByRole('button', { name: 'Tomar foto' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar captura simulada' }))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

it('bloquea la finalización si faltan tareas sin responder', () => {
  page()
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar checklist' }))
  expect(screen.getByText('Completa el resultado de cada tarea.')).toBeInTheDocument()
})

it('bloquea la finalización cuando falta una fotografía obligatoria', () => {
  page()
  markAllConforming()
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar checklist' }))
  expect(screen.getByText('Faltan fotografías obligatorias.')).toBeInTheDocument()
  expect(geo.requestFreshLocation).not.toHaveBeenCalled()
})

it('no permite guardar una tarea no conforme sin observación', () => {
  page()
  fireEvent.click(screen.getAllByRole('button', { name: '! No conforme' })[0])
  expect(screen.getByRole('button', { name: 'Guardar observación' })).toBeDisabled()
})

it('exige una justificación y deja la visita pendiente_validacion cuando falla GPS', async () => {
  vi.mocked(geo.requestFreshLocation).mockRejectedValue(new Error('Permiso de ubicación denegado.'))
  vi.mocked(visits.requestLocationExceptionMock).mockResolvedValue({ status: 'pendiente_validacion', simulated: true })
  page()
  markAllConforming()
  captureEveryRequiredPhoto()

  fireEvent.click(screen.getByRole('button', { name: 'Finalizar checklist' }))
  expect(await screen.findByText('Excepción de ubicación')).toBeInTheDocument()

  const submit = screen.getByRole('button', { name: 'Enviar justificación' })
  expect(submit).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'GPS sin permiso en el dispositivo.' } })
  expect(submit).toBeEnabled()
  fireEvent.click(submit)

  await waitFor(() => expect(visits.requestLocationExceptionMock).toHaveBeenCalledWith(1, 'GPS sin permiso en el dispositivo.'))
  expect(await screen.findByText('Pendiente de validación')).toBeInTheDocument()
  expect(screen.getByText(/Simulación backend: la visita quedó pendiente/i)).toBeInTheDocument()
})
