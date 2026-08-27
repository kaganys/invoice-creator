import type { Router } from '../router.ts'
import {
  addCompanyUser,
  createCompany,
  createCompanyRole,
  deleteCompanyRole,
  getSession,
  listCompanyRoles,
  listCompanyUsers,
  removeCompanyUser,
  updateCompanyRole,
  updateCompanyUser,
} from '../tenancy/handlers.ts'

export function registerTenancyRoutes(router: Router): void {
  router.get('/api/session', (request, env) => getSession(request, env))
  router.post('/api/companies', (request, env) => createCompany(request, env))
  router.get('/api/users', (request, env) => listCompanyUsers(request, env))
  router.post('/api/users', (request, env) => addCompanyUser(request, env))
  router.put('/api/users/:id', (request, env, _ctx, params) =>
    updateCompanyUser(request, env, params.id ?? ''),
  )
  router.delete('/api/users/:id', (request, env, _ctx, params) =>
    removeCompanyUser(request, env, params.id ?? ''),
  )
  router.get('/api/roles', (request, env) => listCompanyRoles(request, env))
  router.post('/api/roles', (request, env) => createCompanyRole(request, env))
  router.put('/api/roles/:id', (request, env, _ctx, params) =>
    updateCompanyRole(request, env, params.id ?? ''),
  )
  router.delete('/api/roles/:id', (request, env, _ctx, params) =>
    deleteCompanyRole(request, env, params.id ?? ''),
  )
}
