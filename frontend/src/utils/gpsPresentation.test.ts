import { expect, it } from 'vitest'
import { displayMeters, gpsFailureMessage } from './gpsPresentation'
it.each([
  [undefined, 'Sin registrar'],
  [null, 'Sin registrar'],
  [-1, 'Sin registrar'],
  [Infinity, 'Sin registrar'],
  [NaN, 'Sin registrar'],
  [0, '0 m'],
  [9.876, '9.9 m'],
  [100.12, '100.1 m'],
])('redondea %s sin alterar el valor persistido', (input, expected) => {
  expect(displayMeters(input)).toBe(expected)
})
it('traduce los códigos y nunca expone uno desconocido', () => {
  expect(gpsFailureMessage('out_of_radius')).toBe(
    'Tu ubicación está fuera del área del establecimiento.',
  )
  expect(gpsFailureMessage('unknown_internal')).toBe('No se pudo confirmar la ubicación.')
  expect(gpsFailureMessage()).toBe('Sin causa registrada')
})
