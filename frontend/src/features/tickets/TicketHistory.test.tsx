import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { TicketHistory } from './TicketHistory'
import type { TimelineEvent } from '../../types/models'

it('no agrupa por hora, resume programación y conserva invalidación en auditoría expandible', async () => {
  const base = {
    at: '2026-10-08T12:00:00Z',
    actorId: 1,
    actorName: 'Ana',
    reason: 'Disponibilidad modificada',
  }
  const events: TimelineEvent[] = [
    { ...base, id: '1', kind: 'invalidate', text: 'Programación sustituida' },
    {
      ...base,
      id: '2',
      kind: 'schedule',
      text: 'Ticket reprogramado / reasignado',
      previous: { technicianId: 2 },
      next: { technicianId: 1 },
    },
    { ...base, id: '3', kind: 'start', text: 'Llegada registrada', reason: undefined },
  ]
  render(<TicketHistory events={events} account person={() => 'Persona'} priority={() => 'Alta'} />)
  expect(screen.getAllByText('Motivo: Disponibilidad modificada')).toHaveLength(1)
  expect(screen.getByText('Atención reprogramada')).toBeVisible()
  expect(screen.getByText('Llegada registrada')).toBeVisible()
  fireEvent.click(screen.getByText('Auditoría de programaciones sustituidas'))
  expect(await screen.findByText('Programación anterior sustituida')).toBeVisible()
  expect(screen.getByText('Evento de auditoría #1')).toBeVisible()
  fireEvent.click(screen.getByText('Ver cambio de programación'))
  expect(await screen.findByText('Evento de auditoría #2')).toBeVisible()
  expect(events).toHaveLength(3)
})
