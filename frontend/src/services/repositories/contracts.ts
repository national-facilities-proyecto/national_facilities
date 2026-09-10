import type {
  AdminEntities,
  AdminKind,
  Answer,
  Coordinates,
  Dashboard,
  Evidence,
  Session,
  Store,
  Ticket,
  Priority,
  User,
  Visit,
} from '../../types/models'
export type LoginInput =
  { kind: 'credentials'; username: string; password: string } | { kind: 'demo'; userId: number }
export type RequestOptions = { signal?: AbortSignal }
export type DraftInput = { answers: Answer[]; workDescription: string; evidenceIds: string[] }
export type TicketInput = {
  category: string
  priority: Priority
  description: string
  evidenceIds: string[]
  storeId: number
}
export interface AuthRepository {
  login(input: LoginInput): Promise<Session>
  restore(): Promise<Session | null>
  logout(): Promise<void>
  changePassword(password: string): Promise<Session>
  demoUsers(): Promise<User[]>
}
export interface ChecklistRepository {
  list(options?: RequestOptions): Promise<Visit[]>
  get(id: number, options?: RequestOptions): Promise<Visit>
  claim(id: number): Promise<Visit>
  saveDraft(id: number, input: DraftInput): Promise<Visit>
}
export interface VisitRepository {
  list(options?: RequestOptions): Promise<Visit[]>
  get(id: number, options?: RequestOptions): Promise<Visit>
  start(id: number, location: Coordinates): Promise<Visit>
  complete(id: number, location: Coordinates): Promise<Visit>
  requestException(id: number, reason: string, failure: string): Promise<Visit>
  reviewException(id: number, approved: boolean, reason: string): Promise<Visit>
}
export interface TicketRepository {
  list(options?: RequestOptions): Promise<Ticket[]>
  get(id: number, options?: RequestOptions): Promise<Ticket>
  create(input: TicketInput): Promise<Ticket>
  schedule(
    id: number,
    technicianId: number,
    scheduledAt: string,
    priority: Priority,
    reason: string,
  ): Promise<Ticket>
}
export interface StoreRepository {
  list(options?: RequestOptions): Promise<Store[]>
  get(id: number, options?: RequestOptions): Promise<Store>
}
export interface UserRepository {
  list(options?: RequestOptions): Promise<User[]>
}
export interface DashboardRepository {
  get(options?: RequestOptions): Promise<Dashboard>
}
export interface AdministrationRepository {
  list<K extends AdminKind>(kind: K, options?: RequestOptions): Promise<AdminEntities[K][]>
  save<K extends AdminKind>(kind: K, entity: AdminEntities[K]): Promise<AdminEntities[K]>
}
export interface EvidenceRepository {
  put(evidence: Evidence): Promise<void>
  get(id: string): Promise<Evidence | undefined>
  remove(id: string): Promise<void>
}
export type MockScenario = 'normal' | 'error_once' | 'conflict_once' | 'empty'
export interface Repositories {
  source: 'mock' | 'api'
  auth: AuthRepository
  checklists: ChecklistRepository
  visits: VisitRepository
  tickets: TicketRepository
  stores: StoreRepository
  users: UserRepository
  dashboard: DashboardRepository
  administration: AdministrationRepository
  evidence: EvidenceRepository
  demo?: { reset(): Promise<void>; setScenario(value: MockScenario): void }
}
