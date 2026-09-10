import type { Repositories } from '../services/repositories/contracts'
import { clearEvidence } from '../services/evidence'
import { clearNfSession } from '../features/auth/session'
import { createFixtures } from './fixtures'
import { writeDatabase } from './storage'
import { scenarioState } from './runtime'

export function createDemoRepository(): NonNullable<Repositories['demo']> {
  return {
    setScenario(value) {
      scenarioState.value = value
      window.dispatchEvent(new Event('nf:data'))
    },
    async reset() {
      await clearEvidence()
      writeDatabase(createFixtures())
      scenarioState.value = 'normal'
      clearNfSession()
      window.dispatchEvent(new Event('nf:logout'))
      window.dispatchEvent(new Event('nf:data'))
    },
  }
}
