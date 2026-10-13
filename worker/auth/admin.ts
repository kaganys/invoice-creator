import type { Permission } from '../../src/auth/permissions.ts'
import { hasPermission } from '../../src/auth/permissions.ts'
import { errorJson } from '../http.ts'
import { createD1TenantStore } from '../tenancy/d1Store.ts'
import { bootstrapAccessUser } from '../tenancy/bootstrap.ts'
import type {
  CompanyRecord,
  RoleRecord,
  UserRecord,
} from '../tenancy/types.ts'
import { canSwitchCompanies, resolveMembership } from './companyAccess.ts'
import { parseAccessIdentity } from './identity.ts'

export type AdminContext = {
  user: UserRecord
  company: CompanyRecord
  role: RoleRecord
  permissions: Permission[]
}

export async function requireAdmin(
  request: Request,
  env: Env,
  permission?: Permission,
): Promise<{ ok: true; ctx: AdminContext } | { ok: false; response: Response }> {
  const identity = await parseAccessIdentity(request, env)
  if (!identity) {
    return {
      ok: false,
      response: errorJson(
        'Sign in with Cloudflare Access to use the admin application.',
        401,
      ),
    }
  }

  const store = createD1TenantStore(env.DB)
  const user = await bootstrapAccessUser(store, identity)
  const memberships = await store.listMembershipsForUser(user.id)
  if (memberships.length === 0) {
    return {
      ok: false,
      response: errorJson(
        `Cloudflare login ${identity.email} is not assigned to a company. Ask an owner to add this email.`,
        403,
      ),
    }
  }

  const requested = request.headers.get('x-company-id')?.trim() ?? ''
  const current = resolveMembership(memberships, {
    requestedCompanyId: requested,
    lastCompanyId: user.lastCompanyId,
  })
  if (!current) {
    return {
      ok: false,
      response: errorJson('No company membership found.', 403),
    }
  }

  if (permission && !hasPermission(current.role.permissions, permission)) {
    return {
      ok: false,
      response: errorJson('You do not have permission to do that.', 403),
    }
  }

  if (user.lastCompanyId !== current.company.id) {
    await store.upsertUser({
      ...user,
      lastCompanyId: current.company.id,
      updatedAt: new Date().toISOString(),
    })
  }

  return {
    ok: true,
    ctx: {
      user,
      company: current.company,
      role: current.role,
      permissions: current.role.permissions,
    },
  }
}

export async function loadSession(request: Request, env: Env) {
  const identity = await parseAccessIdentity(request, env)
  if (!identity) {
    return errorJson(
      'Sign in with Cloudflare Access to use the admin application.',
      401,
    )
  }
  const store = createD1TenantStore(env.DB)
  const user = await bootstrapAccessUser(store, identity)
  const memberships = await store.listMembershipsForUser(user.id)
  const requested = request.headers.get('x-company-id')?.trim() ?? ''
  const current = resolveMembership(memberships, {
    requestedCompanyId: requested,
    lastCompanyId: user.lastCompanyId,
  })
  return {
    email: identity.email,
    name: user.name,
    invited: memberships.length > 0,
    canCreateTenant: memberships.length === 0,
    userId: user.id,
    canSwitchCompanies: canSwitchCompanies(memberships),
    companies: memberships.map((entry) => ({
      id: entry.company.id,
      name: entry.company.name,
      role: entry.role.name,
      permissions: entry.role.permissions,
    })),
    currentCompany: current
      ? {
          id: current.company.id,
          name: current.company.name,
          role: current.role.name,
          permissions: current.role.permissions,
        }
      : null,
  }
}
