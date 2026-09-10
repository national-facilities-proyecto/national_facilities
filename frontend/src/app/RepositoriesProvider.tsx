import { createContext, useContext } from 'react'
import type { Repositories } from '../services/repositories/contracts'
export const RepositoriesContext = createContext<Repositories | null>(null)
export function useRepositories(): Repositories {
  const value = useContext(RepositoriesContext)
  if (!value) throw new Error('Falta el proveedor de repositorios.')
  return value
}
