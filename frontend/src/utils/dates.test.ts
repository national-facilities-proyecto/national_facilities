import { expect, it } from 'vitest'
import { dateBucket, operationDate, scheduleDate } from './dates'

it('días y fechas de programación respetan Perú en el límite UTC', () => {
  expect(operationDate(new Date('2026-10-09T02:00:00Z'))).toBe('2026-10-08')
  expect(scheduleDate('2026-10-08')).toBe('08/10/2026')
  expect(scheduleDate('2026-10-09T02:00:00Z')).toBe('08/10/2026')
  expect(dateBucket('2026-10-08T23:59:00-05:00', new Date('2026-10-08T00:01:00-05:00'))).toBe(
    'today',
  )
})
