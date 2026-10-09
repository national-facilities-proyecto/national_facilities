import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { renderPage } from '../../test/render'
import { createMockRepositories } from '../../test/doubles/repositories'
import { readDatabase } from '../../test/doubles/storage'
import { AdminForm } from './AdminForm'
import type { AdminKind, AdminEntities } from '../../types/models'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

async function form(kind: AdminKind, original?: AdminEntities[AdminKind]) {
  const repos = createMockRepositories()
  await repos.auth.login({ kind: 'demo', userId: 4 })
  const client = await repos.administration.save('clients', {
    id: 0,
    name: 'Otro cliente',
    taxId: 'OTHER',
    email: '',
  })
  const zone = await repos.administration.save('zones', {
    id: 0,
    name: 'Otra zona',
    clientId: client.id,
    active: true,
  })
  const db = readDatabase()
  const save = vi.spyOn(repos.administration, 'save')
  const close = vi.fn()
  renderPage(
    <AdminForm
      kind={kind}
      original={original}
      stores={db.stores}
      clients={db.clients}
      templates={db.templates}
      zones={db.zones}
      specialties={db.specialties}
      onClose={close}
    />,
    repos,
  )
  return { repos, save, close, client, zone, db }
}

function userFields() {
  fireEvent.change(screen.getByLabelText('Usuario de acceso'), { target: { value: 'new-tech' } })
  fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Técnico nuevo' } })
  fireEvent.change(screen.getByLabelText('Contraseña inicial (obligatoria al crear)'), {
    target: { value: 'Field-test-secure-2026!' },
  })
}

it('rechaza espacios en el usuario con error asociado al campo antes de confirmar', async () => {
  const { save } = await form('users')
  userFields()
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'administrator' } })
  for (const username of ['new tech', ' new-tech', 'new-tech ', 'new\u00a0tech']) {
    fireEvent.change(screen.getByLabelText('Usuario de acceso'), { target: { value: username } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
    expect(screen.getByLabelText('Usuario de acceso')).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getAllByText('El nombre de usuario no puede contener espacios.'),
    ).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Confirmar y guardar' })).not.toBeInTheDocument()
  }
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Usuario de acceso'), { target: { value: 'new-tech' } })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  expect(screen.getByRole('button', { name: 'Confirmar y guardar' })).toBeInTheDocument()
})

it('filtra zonas de tienda por cliente y limpia la selección al cambiar cliente', async () => {
  const { client, zone } = await form('stores')
  const select = screen.getByLabelText('Zona')
  expect(within(select).queryByRole('option', { name: zone.name })).not.toBeInTheDocument()
  fireEvent.change(select, { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: String(client.id) } })
  expect(select).toHaveValue('')
  expect(within(select).getByRole('option', { name: zone.name })).toBeInTheDocument()
  expect(within(select).queryByRole('option', { name: 'Chorrillos' })).not.toBeInTheDocument()
})

it('guarda múltiples parejas explícitas y no administra tiendas para un técnico', async () => {
  const { save, close, client, zone } = await form('users')
  userFields()
  expect(screen.queryByLabelText('Tienda asignada')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Añadir cobertura' }))
  fireEvent.change(screen.getByLabelText('Cliente de cobertura 1'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Zona de cobertura 1'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Añadir cobertura' }))
  fireEvent.change(screen.getByLabelText('Cliente de cobertura 2'), {
    target: { value: String(client.id) },
  })
  fireEvent.change(screen.getByLabelText('Zona de cobertura 2'), {
    target: { value: String(zone.id) },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledWith(
    'users',
    expect.objectContaining({
      role: 'technician',
      storeIds: [],
      email: '',
      coverages: [
        { clientId: 1, zoneId: 1 },
        { clientId: client.id, zoneId: zone.id },
      ],
    }),
  )
})

it('filtra cada fila de cobertura por su cliente y limpia una zona anterior', async () => {
  const { client, zone } = await form('users')
  fireEvent.click(screen.getByRole('button', { name: 'Añadir cobertura' }))
  fireEvent.change(screen.getByLabelText('Cliente de cobertura 1'), { target: { value: '1' } })
  const select = screen.getByLabelText('Zona de cobertura 1')
  expect(within(select).queryByRole('option', { name: zone.name })).not.toBeInTheDocument()
  fireEvent.change(select, { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Cliente de cobertura 1'), {
    target: { value: String(client.id) },
  })
  expect(select).toHaveValue('')
  expect(within(select).getByRole('option', { name: zone.name })).toBeInTheDocument()
})

it('rechaza coberturas repetidas antes de guardar', async () => {
  const { save } = await form('users')
  userFields()
  for (const index of [1, 2]) {
    fireEvent.click(screen.getByRole('button', { name: 'Añadir cobertura' }))
    fireEvent.change(screen.getByLabelText(`Cliente de cobertura ${index}`), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText(`Zona de cobertura ${index}`), {
      target: { value: '1' },
    })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  expect(screen.getByRole('alert')).toHaveTextContent('No repitas parejas Cliente + Zona.')
  expect(save).not.toHaveBeenCalled()
})

it('supervisor de tienda usa selector único y administrador no exige cobertura', async () => {
  await form('users')
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'store_supervisor' } })
  expect(screen.getByLabelText('Tienda asignada')).not.toHaveAttribute('multiple')
  expect(screen.queryByRole('button', { name: 'Añadir cobertura' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'administrator' } })
  expect(screen.queryByLabelText('Tienda asignada')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Añadir cobertura' })).not.toBeInTheDocument()
})

it('crea una zona administrable reutilizando el formulario actual', async () => {
  const { save, close } = await form('zones')
  fireEvent.change(screen.getByLabelText('Nombre de zona'), { target: { value: 'Zona nueva' } })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledWith('zones', {
    id: 0,
    name: 'Zona nueva',
    clientId: 1,
    active: true,
  })
})

it('administra la habilitación de especialidad por cliente', async () => {
  const { save, close } = await form('clientSpecialties')
  fireEvent.change(screen.getByLabelText('Especialidad'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledWith('clientSpecialties', {
    id: 0,
    clientId: 2,
    categoryId: 1,
    active: true,
  })
})
