import { json, errorJson } from '../http.ts'
import { asTrimmedString, isRecord, readJsonBody } from '../lib/json.ts'
import { createEntityId, isUuid, nowIso } from '../lib/ids.ts'
import {
  normalizePermissions,
  type Permission,
} from '../../src/auth/permissions.ts'
import { loadSession, requireAdmin } from '../auth/admin.ts'
import { createD1TenantStore } from './d1Store.ts'
import { seedPresetRoles, slugifyCompanyName } from './bootstrap.ts'

function publicUser(row: {
  user: { id: string; email: string; name: string; lastSeenAt: string | null }
  role: { id: string; name: string; key: string | null; permissions: Permission[]; isSystem: boolean }
  membership: { id: string; createdAt: string }
}) {
  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    lastSeenAt: row.user.lastSeenAt,
    role: {
      id: row.role.id,
      name: row.role.name,
      key: row.role.key,
      permissions: row.role.permissions,
      isSystem: row.role.isSystem,
    },
    membershipId: row.membership.id,
    addedAt: row.membership.createdAt,
  }
}

export async function getSession(request: Request, env: Env): Promise<Response> {
  const payload = await loadSession(request, env)
  if (payload instanceof Response) {
    return payload
  }
  return json(payload)
}

export async function createCompany(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env, 'companies.create')
  if (!auth.ok) {
    return auth.response
  }
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('Company data must be a JSON object.', 400)
  }
  const name = asTrimmedString(body.value.name)
  if (name.length < 2) {
    return errorJson('Company name is required.', 400)
  }
  const store = createD1TenantStore(env.DB)
  const timestamp = nowIso()
  const slugBase = slugifyCompanyName(name)
  let slug = slugBase
  let attempt = 1
  while (await store.listCompanies().then((rows) => rows.some((row) => row.slug === slug))) {
    attempt += 1
    slug = `${slugBase}-${attempt}`
  }
  const company = await store.createCompany({
    id: createEntityId(),
    name,
    slug,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await seedPresetRoles(store, company.id, timestamp)
  const owner = (await store.listRoles(company.id)).find((role) => role.key === 'owner')
  if (owner) {
    await store.createMembership({
      id: createEntityId(),
      companyId: company.id,
      userId: auth.ctx.user.id,
      roleId: owner.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
  return json({ company }, { status: 201 })
}

export async function listCompanyUsers(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env, 'users.view')
  if (!auth.ok) {
    return auth.response
  }
  const store = createD1TenantStore(env.DB)
  const users = await store.listUsersByCompany(auth.ctx.company.id)
  const roles = await store.listRoles(auth.ctx.company.id)
  return json({
    users: users.map(publicUser),
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      key: role.key,
      permissions: role.permissions,
      isSystem: role.isSystem,
    })),
  })
}

export async function addCompanyUser(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env, 'users.manage')
  if (!auth.ok) {
    return auth.response
  }
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('User data must be a JSON object.', 400)
  }
  const email = asTrimmedString(body.value.email).toLowerCase()
  const roleId = asTrimmedString(body.value.roleId)
  if (!email.includes('@')) {
    return errorJson('Enter the Cloudflare Access login email.', 400)
  }
  if (!isUuid(roleId)) {
    return errorJson('A role is required.', 400)
  }
  const store = createD1TenantStore(env.DB)
  const role = await store.getRole(roleId)
  if (!role || role.companyId !== auth.ctx.company.id) {
    return errorJson('Role not found.', 404)
  }
  const timestamp = nowIso()
  const existing = await store.getUserByEmail(email)
  const user = existing
    ? existing
    : await store.upsertUser({
        id: createEntityId(),
        email,
        name: asTrimmedString(body.value.name) || email.split('@')[0] || email,
        lastCompanyId: auth.ctx.company.id,
        lastSeenAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
  const already = await store.getMembership(auth.ctx.company.id, user.id)
  if (already) {
    return errorJson('That email already has access to this company.', 409)
  }
  await store.createMembership({
    id: createEntityId(),
    companyId: auth.ctx.company.id,
    userId: user.id,
    roleId,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return json({ ok: true }, { status: 201 })
}

export async function updateCompanyUser(
  request: Request,
  env: Env,
  membershipId: string,
): Promise<Response> {
  const auth = await requireAdmin(request, env, 'users.manage')
  if (!auth.ok) {
    return auth.response
  }
  if (!isUuid(membershipId)) {
    return errorJson('Invalid membership id.', 400)
  }
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('User data must be a JSON object.', 400)
  }
  const roleId = asTrimmedString(body.value.roleId)
  const store = createD1TenantStore(env.DB)
  const role = await store.getRole(roleId)
  if (!role || role.companyId !== auth.ctx.company.id) {
    return errorJson('Role not found.', 404)
  }
  await store.updateMembershipRole(membershipId, roleId, nowIso())
  return json({ ok: true })
}

export async function removeCompanyUser(
  request: Request,
  env: Env,
  membershipId: string,
): Promise<Response> {
  const auth = await requireAdmin(request, env, 'users.manage')
  if (!auth.ok) {
    return auth.response
  }
  if (!isUuid(membershipId)) {
    return errorJson('Invalid membership id.', 400)
  }
  const store = createD1TenantStore(env.DB)
  const users = await store.listUsersByCompany(auth.ctx.company.id)
  const target = users.find((row) => row.membership.id === membershipId)
  if (!target) {
    return errorJson('User not found.', 404)
  }
  if (target.user.id === auth.ctx.user.id) {
    return errorJson('You cannot remove your own access.', 409)
  }
  await store.deleteMembership(membershipId)
  return json({ ok: true })
}

export async function listCompanyRoles(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env, 'users.view')
  if (!auth.ok) {
    return auth.response
  }
  const store = createD1TenantStore(env.DB)
  const roles = await store.listRoles(auth.ctx.company.id)
  return json({
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      key: role.key,
      permissions: role.permissions,
      isSystem: role.isSystem,
    })),
  })
}

export async function createCompanyRole(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env, 'roles.manage')
  if (!auth.ok) {
    return auth.response
  }
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('Role data must be a JSON object.', 400)
  }
  const name = asTrimmedString(body.value.name)
  if (name.length < 2) {
    return errorJson('Role name is required.', 400)
  }
  const permissions = normalizePermissions(body.value.permissions)
  const timestamp = nowIso()
  const store = createD1TenantStore(env.DB)
  const role = await store.createRole({
    id: createEntityId(),
    companyId: auth.ctx.company.id,
    key: null,
    name,
    permissions,
    isSystem: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return json({ role }, { status: 201 })
}

export async function updateCompanyRole(
  request: Request,
  env: Env,
  roleId: string,
): Promise<Response> {
  const auth = await requireAdmin(request, env, 'roles.manage')
  if (!auth.ok) {
    return auth.response
  }
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('Role data must be a JSON object.', 400)
  }
  const store = createD1TenantStore(env.DB)
  const existing = await store.getRole(roleId)
  if (!existing || existing.companyId !== auth.ctx.company.id) {
    return errorJson('Role not found.', 404)
  }
  if (existing.isSystem) {
    return errorJson('Built-in roles cannot be edited. Duplicate them as a custom role.', 409)
  }
  const updated = await store.updateRole(roleId, {
    name: asTrimmedString(body.value.name) || existing.name,
    permissions: normalizePermissions(body.value.permissions),
    updatedAt: nowIso(),
  })
  return json({ role: updated })
}

export async function deleteCompanyRole(
  request: Request,
  env: Env,
  roleId: string,
): Promise<Response> {
  const auth = await requireAdmin(request, env, 'roles.manage')
  if (!auth.ok) {
    return auth.response
  }
  const store = createD1TenantStore(env.DB)
  const existing = await store.getRole(roleId)
  if (!existing || existing.companyId !== auth.ctx.company.id) {
    return errorJson('Role not found.', 404)
  }
  if (existing.isSystem) {
    return errorJson('Built-in roles cannot be deleted.', 409)
  }
  if ((await store.countMembershipsForRole(roleId)) > 0) {
    return errorJson('Move users off this role before deleting it.', 409)
  }
  await store.deleteRole(roleId)
  return json({ ok: true })
}
