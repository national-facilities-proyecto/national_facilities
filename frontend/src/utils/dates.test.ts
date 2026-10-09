import { expect, it } from 'vitest'
import { dateBucket, dayOffset, operationDate, scheduleDate } from './dates'

it.each([
  ['2026-10-09T02:54:01.233Z', '2026-10-07', '2026-10-08', '2026-10-09'],
  ['2026-10-09T05:00:00Z', '2026-10-08', '2026-10-09', '2026-10-10'],
  ['2026-11-01T02:00:00Z', '2026-10-30', '2026-10-31', '2026-11-01'],
  ['2027-01-01T02:00:00Z', '2026-12-30', '2026-12-31', '2027-01-01'],
  ['2024-03-01T02:00:00Z', '2024-02-28', '2024-02-29', '2024-03-01'],
])('dayOffset usa días de Lima e instantes inequívocos en %s', (at, yesterday, today, tomorrow) => {
  const clock = new Date(at)
  expect(dayOffset(-1, clock)).toBe(`${yesterday}T15:00:00.000Z`)
  expect(dayOffset(0, clock)).toBe(`${today}T15:00:00.000Z`)
  expect(dayOffset(1, clock)).toBe(`${tomorrow}T15:00:00.000Z`)
  expect(operationDate(new Date(dayOffset(0, clock)))).toBe(today)
})

it('días y fechas de programación respetan Perú en el límite UTC', () => {
  expect(operationDate(new Date('2026-10-09T02:00:00Z'))).toBe('2026-10-08')
  expect(scheduleDate('2026-10-08')).toBe('08/10/2026')
  expect(scheduleDate('2026-10-09T02:00:00Z')).toBe('08/10/2026')
  expect(dateBucket('2026-10-08T23:59:00-05:00', new Date('2026-10-08T00:01:00-05:00'))).toBe(
    'today',
  )
})
