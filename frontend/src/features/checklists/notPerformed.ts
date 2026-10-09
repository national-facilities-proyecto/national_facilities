import type { UserRole, Visit } from '../../types/models'

export function canMarkNotPerformed(visit: Visit, role?: UserRole): boolean {
  if (
    visit.readOnly ||
    visit.completedAt ||
    !['claimed', 'in_progress', 'correction_required'].includes(visit.status)
  )
    return false
  if (
    !['physical_work', 'physical_finished', 'results', 'correction_required', 'scheduled'].includes(
      visit.phase ?? '',
    )
  )
    return false
  if (role === 'technician') return Boolean(visit.startedAt && visit.phase !== 'scheduled')
  return (
    role === 'account_supervisor' &&
    Boolean(visit.startedAt || (visit.origin === 'ticket' && visit.phase === 'scheduled'))
  )
}
