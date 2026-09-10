import type { Repositories } from '../services/repositories/contracts'
import { localEvidenceRepository } from '../services/evidence'
import { createDemoRepository } from './demoRepository'
import { createAuthRepository } from './authRepository'
import { createChecklistsRepository } from './checklistsRepository'
import { createVisitsRepository } from './visitsRepository'
import { createTicketsRepository } from './ticketsRepository'
import { createStoresRepository } from './storesRepository'
import { createUsersRepository } from './usersRepository'
import { createAdministrationRepository } from './administrationRepository'
import { createDashboardRepository } from './dashboardRepository'

export function createMockRepositories(): Repositories {
  return {
    source: 'mock',
    evidence: localEvidenceRepository,
    demo: createDemoRepository(),
    auth: createAuthRepository(),
    checklists: createChecklistsRepository(),
    visits: createVisitsRepository(),
    tickets: createTicketsRepository(),
    stores: createStoresRepository(),
    users: createUsersRepository(),
    administration: createAdministrationRepository(),
    dashboard: createDashboardRepository(),
  }
}
