import { requireAdmin } from '../auth/admin.ts'
import { createD1DirectoryStore } from '../people/d1Store.ts'
import {
  createPerson,
  deletePerson,
  getPerson,
  listPeople,
  updatePerson,
} from '../people/handlers.ts'
import type { Router } from '../router.ts'

export function registerPeopleRoutes(router: Router): void {
  router.get('/api/people', async (request, env) => {
    const auth = await requireAdmin(request, env, 'people.view')
    if (!auth.ok) {
      return auth.response
    }
    return listPeople(createD1DirectoryStore(env.DB, auth.ctx.company.id))
  })

  router.post('/api/people', async (request, env) => {
    const auth = await requireAdmin(request, env, 'people.manage')
    if (!auth.ok) {
      return auth.response
    }
    return createPerson(request, createD1DirectoryStore(env.DB, auth.ctx.company.id))
  })

  router.get('/api/people/:id', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'people.view')
    if (!auth.ok) {
      return auth.response
    }
    return getPerson(
      params.id ?? '',
      createD1DirectoryStore(env.DB, auth.ctx.company.id),
    )
  })

  router.put('/api/people/:id', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'people.manage')
    if (!auth.ok) {
      return auth.response
    }
    return updatePerson(
      params.id ?? '',
      request,
      createD1DirectoryStore(env.DB, auth.ctx.company.id),
    )
  })

  router.delete('/api/people/:id', async (request, env, _ctx, params) => {
    const auth = await requireAdmin(request, env, 'people.manage')
    if (!auth.ok) {
      return auth.response
    }
    return deletePerson(
      params.id ?? '',
      createD1DirectoryStore(env.DB, auth.ctx.company.id),
    )
  })
}
