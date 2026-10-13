import type { Permission } from '../auth/permissions.ts'
import { ApiError, apiRequest } from './http.ts'

export type SessionCompany = {
  id: string
  name: string
  role: string
  permissions: Permission[]
}

export type SessionPayload = {
  email: string
  name: string
  invited: boolean
  canCreateTenant: boolean
  userId: string
  canSwitchCompanies: boolean
  companies: SessionCompany[]
  currentCompany: SessionCompany | null
}

export type TeamUser = {
  id: string
  email: string
  name: string
  lastSeenAt: string | null
  role: {
    id: string
    name: string
    key: string | null
    permissions: Permission[]
    isSystem: boolean
  }
  membershipId: string
  addedAt: string
}

export type TeamRole = {
  id: string
  name: string
  key: string | null
  permissions: Permission[]
  isSystem: boolean
}

export async function fetchSession(): Promise<SessionPayload> {
  return apiRequest<SessionPayload>('/api/session')
}

export async function fetchTeam(): Promise<{ users: TeamUser[]; roles: TeamRole[] }> {
  return apiRequest('/api/users')
}

export async function addTeamUser(payload: {
  email: string
  roleId: string
  name?: string
}): Promise<{ ok: true }> {
  return apiRequest('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateTeamUser(
  membershipId: string,
  roleId: string,
): Promise<{ ok: true }> {
  return apiRequest(`/api/users/${membershipId}`, {
    method: 'PUT',
    body: JSON.stringify({ roleId }),
  })
}

export async function removeTeamUser(membershipId: string): Promise<{ ok: true }> {
  return apiRequest(`/api/users/${membershipId}`, { method: 'DELETE' })
}

export async function createTeamRole(payload: {
  name: string
  permissions: Permission[]
}): Promise<{ role: TeamRole }> {
  return apiRequest('/api/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateTeamRole(
  roleId: string,
  payload: { name: string; permissions: Permission[] },
): Promise<{ role: TeamRole }> {
  return apiRequest(`/api/roles/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteTeamRole(roleId: string): Promise<{ ok: true }> {
  return apiRequest(`/api/roles/${roleId}`, { method: 'DELETE' })
}

export async function createCompany(name: string): Promise<{ company: { id: string; name: string } }> {
  return apiRequest('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function onboardCompany(payload: {
  companyName: string
  ownerName: string
  fromName: string
  fromEmail: string
  zelleEmail: string
  inviteCode?: string
  wordmark?: File
  icon?: File
  invoiceLogo?: File
}): Promise<{ company: { id: string; name: string } }> {
  const form = new FormData()
  form.set('companyName', payload.companyName)
  form.set('ownerName', payload.ownerName)
  form.set('fromName', payload.fromName)
  form.set('fromEmail', payload.fromEmail)
  form.set('zelleEmail', payload.zelleEmail)
  if (payload.inviteCode) {
    form.set('inviteCode', payload.inviteCode)
  }
  if (payload.wordmark) {
    form.set('site-wordmark', payload.wordmark)
  }
  if (payload.icon) {
    form.set('site-icon', payload.icon)
  }
  if (payload.invoiceLogo) {
    form.set('invoice-logo', payload.invoiceLogo)
  }
  const response = await fetch('/api/onboard', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) {
    let message = response.statusText || `Request failed (${response.status})`
    try {
      const body: unknown = await response.json()
      if (
        body &&
        typeof body === 'object' &&
        'error' in body &&
        typeof body.error === 'string' &&
        body.error.trim()
      ) {
        message = body.error
      }
    } catch {
      // Keep status text.
    }
    throw new ApiError(message, response.status)
  }
  return (await response.json()) as { company: { id: string; name: string } }
}
