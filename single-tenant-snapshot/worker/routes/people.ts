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
  router.get('/api/people', (_request, env) =>
    listPeople(createD1DirectoryStore(env.DB)),
  )

  router.post('/api/people', (request, env) =>
    createPerson(request, createD1DirectoryStore(env.DB)),
  )

  router.get('/api/people/:id', (_request, env, _ctx, params) =>
    getPerson(params.id ?? '', createD1DirectoryStore(env.DB)),
  )

  router.put('/api/people/:id', (request, env, _ctx, params) =>
    updatePerson(params.id ?? '', request, createD1DirectoryStore(env.DB)),
  )

  router.delete('/api/people/:id', (_request, env, _ctx, params) =>
    deletePerson(params.id ?? '', createD1DirectoryStore(env.DB)),
  )
}
