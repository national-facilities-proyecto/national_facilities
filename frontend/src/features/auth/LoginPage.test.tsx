import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { LoginPage } from './LoginPage'

it('muestra validaciones accesibles al enviar el login vacío', () => {
  render(<LoginPage onAuthenticated={() => undefined} />)
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
  expect(screen.getByText('Ingresa tu correo electrónico.')).toBeInTheDocument()
  expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument()
})
