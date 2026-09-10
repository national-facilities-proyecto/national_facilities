import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { RepositoriesContext } from '../app/RepositoriesProvider'
import { AuthProvider } from '../features/auth/AuthProvider'
import { createMockRepositories } from '../mocks/repositories'
import type { Repositories } from '../services/repositories/contracts'
export function renderPage(
  node: ReactNode,
  repos: Repositories = createMockRepositories(),
  path = '/',
) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <RepositoriesContext.Provider value={repos}>
            <AuthProvider>{node}</AuthProvider>
          </RepositoriesContext.Provider>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  return { ...render(<RouterProvider router={router} />), router, repos }
}
