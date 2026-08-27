import { useEffect, useState } from 'react'
import {
  addTeamUser,
  createCompany,
  createTeamRole,
  deleteTeamRole,
  fetchTeam,
  removeTeamUser,
  updateTeamUser,
  type TeamRole,
  type TeamUser,
} from '../../api/session.ts'
import {
  PERMISSION_GROUPS,
  type Permission,
} from '../../auth/permissions.ts'
import { useSession } from '../../session/SessionContext.tsx'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'
import './UsersPage.css'

export function UsersPage() {
  const { session, can, refresh } = useSession()
  const [users, setUsers] = useState<TeamUser[]>([])
  const [roles, setRoles] = useState<TeamRole[]>([])
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [roleName, setRoleName] = useState('')
  const [rolePermissions, setRolePermissions] = useState<Permission[]>([])
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const payload = await fetchTeam()
    setUsers(payload.users)
    setRoles(payload.roles)
    if (!roleId && payload.roles[0]) {
      setRoleId(payload.roles[0].id)
    }
  }

  useEffect(() => {
    void load().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not load users.')
    })
  }, [])

  function togglePermission(permission: Permission) {
    setRolePermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    )
  }

  return (
    <div className="app-page">
      <p className="users-login">
        Signed in with Cloudflare as <strong>{session?.email}</strong>
        {session?.currentCompany
          ? ` · ${session.currentCompany.role} at ${session.currentCompany.name}`
          : ''}
      </p>
      {error ? <p className="api-banner api-banner--error">{error}</p> : null}

      <InvoiceSection
        title="Users"
        description="Usernames are Cloudflare Access login emails. People sign in with that same email — there is no separate password."
      >
        {can('users.manage') ? (
          <div className="form-grid form-grid--2">
            <Field label="Cloudflare login email" htmlFor="team-email">
              <input
                id="team-email"
                className="field__input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Role" htmlFor="team-role">
              <select
                id="team-role"
                className="field__select"
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid__full">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setError(null)
                  void addTeamUser({ email, roleId })
                    .then(async () => {
                      setEmail('')
                      await load()
                    })
                    .catch((caught: unknown) => {
                      setError(
                        caught instanceof Error
                          ? caught.message
                          : 'Could not add user.',
                      )
                    })
                    .finally(() => setBusy(false))
                }}
              >
                Add user
              </button>
            </div>
          </div>
        ) : null}
        <table className="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Last seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.membershipId}>
                <td>{user.email}</td>
                <td>{user.name || '—'}</td>
                <td>
                  {can('users.manage') ? (
                    <select
                      className="field__select"
                      value={user.role.id}
                      onChange={(event) => {
                        void updateTeamUser(user.membershipId, event.target.value)
                          .then(load)
                          .catch((caught: unknown) =>
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : 'Could not update role.',
                            ),
                          )
                      }}
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    user.role.name
                  )}
                </td>
                <td>{user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : 'Never'}</td>
                <td>
                  {can('users.manage') ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        void removeTeamUser(user.membershipId)
                          .then(load)
                          .catch((caught: unknown) =>
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : 'Could not remove user.',
                            ),
                          )
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </InvoiceSection>

      {can('roles.manage') ? (
        <InvoiceSection
          title="Custom role"
          description="Built-in roles stay as-is. Create a custom role with exactly the permissions this person should have."
        >
          <Field label="Role name" htmlFor="role-name">
            <input
              id="role-name"
              className="field__input"
              value={roleName}
              onChange={(event) => setRoleName(event.target.value)}
            />
          </Field>
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.id} className="users-perms">
              <legend>{group.label}</legend>
              {group.permissions.map((permission) => (
                <label key={permission.id} className="users-perms__item">
                  <input
                    type="checkbox"
                    checked={rolePermissions.includes(permission.id)}
                    onChange={() => togglePermission(permission.id)}
                  />
                  {permission.label}
                </label>
              ))}
            </fieldset>
          ))}
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void createTeamRole({ name: roleName, permissions: rolePermissions })
                .then(async () => {
                  setRoleName('')
                  setRolePermissions([])
                  await load()
                })
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not create role.',
                  ),
                )
                .finally(() => setBusy(false))
            }}
          >
            Create role
          </button>
          <ul className="users-role-list">
            {roles.map((role) => (
              <li key={role.id}>
                <strong>{role.name}</strong>
                {role.isSystem ? ' (built-in)' : ''}
                {role.isSystem ? null : (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      void deleteTeamRole(role.id)
                        .then(load)
                        .catch((caught: unknown) =>
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : 'Could not delete role.',
                          ),
                        )
                    }}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        </InvoiceSection>
      ) : null}

      {can('companies.create') ? (
        <InvoiceSection
          title="New company"
          description="Creates a separate tenant with its own invoices, people, settings, and roles."
        >
          <Field label="Company name" htmlFor="company-name">
            <input
              id="company-name"
              className="field__input"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void createCompany(companyName)
                .then(async () => {
                  setCompanyName('')
                  await refresh()
                })
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not create company.',
                  ),
                )
                .finally(() => setBusy(false))
            }}
          >
            Create company
          </button>
        </InvoiceSection>
      ) : null}
    </div>
  )
}
