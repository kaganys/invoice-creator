import { normalizePermissions } from '../../src/auth/permissions.ts'
import type {
  CompanyRecord,
  MembershipRecord,
  MembershipView,
  RoleRecord,
  TenantStore,
  UserRecord,
} from './types.ts'

type CompanyRow = {
  id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

type UserRow = {
  id: string
  email: string
  name: string
  last_company_id: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

type RoleRow = {
  id: string
  company_id: string
  key: string | null
  name: string
  permissions_json: string
  is_system: number
  created_at: string
  updated_at: string
}

type MembershipRow = {
  id: string
  company_id: string
  user_id: string
  role_id: string
  created_at: string
  updated_at: string
}

function mapCompany(row: CompanyRow): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    lastCompanyId: row.last_company_id,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRole(row: RoleRow): RoleRecord {
  let parsed: unknown
  try {
    parsed = JSON.parse(row.permissions_json)
  } catch {
    parsed = []
  }
  return {
    id: row.id,
    companyId: row.company_id,
    key: row.key,
    name: row.name,
    permissions: normalizePermissions(parsed),
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMembership(row: MembershipRow): MembershipRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    roleId: row.role_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toMembershipView(
  row: Record<string, string | number | null>,
  userId: string,
): MembershipView {
  return {
    company: mapCompany({
      id: String(row.company_id),
      name: String(row.company_name),
      slug: String(row.slug),
      created_at: String(row.company_created_at),
      updated_at: String(row.company_updated_at),
    }),
    role: mapRole({
      id: String(row.role_id),
      company_id: String(row.company_id),
      key: typeof row.key === 'string' ? row.key : null,
      name: String(row.role_name),
      permissions_json: String(row.permissions_json ?? '[]'),
      is_system: Number(row.is_system ?? 0),
      created_at: String(row.role_created_at),
      updated_at: String(row.role_updated_at),
    }),
    membership: mapMembership({
      id: String(row.membership_id),
      company_id: String(row.company_id),
      user_id: userId,
      role_id: String(row.role_id),
      created_at: String(row.membership_created_at),
      updated_at: String(row.membership_updated_at),
    }),
  }
}

export function createD1TenantStore(db: D1Database): TenantStore {
  return {
    async listCompanies() {
      const rows = await db
        .prepare('SELECT * FROM companies ORDER BY name COLLATE NOCASE ASC')
        .all<CompanyRow>()
      return (rows.results ?? []).map(mapCompany)
    },

    async getCompany(id) {
      const row = await db
        .prepare('SELECT * FROM companies WHERE id = ?')
        .bind(id)
        .first<CompanyRow>()
      return row ? mapCompany(row) : null
    },

    async createCompany(record) {
      await db
        .prepare(
          `INSERT INTO companies (id, name, slug, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(record.id, record.name, record.slug, record.createdAt, record.updatedAt)
        .run()
      return record
    },

    async updateCompany(id, fields) {
      const row = await db
        .prepare(
          `UPDATE companies SET name = ?, slug = ?, updated_at = ?
           WHERE id = ? RETURNING *`,
        )
        .bind(fields.name, fields.slug, fields.updatedAt, id)
        .first<CompanyRow>()
      return row ? mapCompany(row) : null
    },

    async getUserByEmail(email) {
      const row = await db
        .prepare('SELECT * FROM users WHERE email = ?')
        .bind(email)
        .first<UserRow>()
      return row ? mapUser(row) : null
    },

    async getUser(id) {
      const row = await db
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(id)
        .first<UserRow>()
      return row ? mapUser(row) : null
    },

    async upsertUser(record) {
      await db
        .prepare(
          `INSERT INTO users (
             id, email, name, last_company_id, last_seen_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             name = excluded.name,
             last_company_id = COALESCE(excluded.last_company_id, users.last_company_id),
             last_seen_at = excluded.last_seen_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          record.id,
          record.email,
          record.name,
          record.lastCompanyId,
          record.lastSeenAt,
          record.createdAt,
          record.updatedAt,
        )
        .run()
      const stored = await this.getUserByEmail(record.email)
      if (!stored) {
        throw new Error('Failed to persist user.')
      }
      return stored
    },

    async listUsersByCompany(companyId) {
      const rows = await db
        .prepare(
          `SELECT
             users.id AS user_id, users.email, users.name, users.last_company_id,
             users.last_seen_at, users.created_at AS user_created_at,
             users.updated_at AS user_updated_at,
             roles.id AS role_id, roles.company_id, roles.key, roles.name AS role_name,
             roles.permissions_json, roles.is_system, roles.created_at AS role_created_at,
             roles.updated_at AS role_updated_at,
             memberships.id AS membership_id, memberships.created_at AS membership_created_at,
             memberships.updated_at AS membership_updated_at
           FROM memberships
           JOIN users ON users.id = memberships.user_id
           JOIN roles ON roles.id = memberships.role_id
           WHERE memberships.company_id = ?
           ORDER BY users.email COLLATE NOCASE ASC`,
        )
        .bind(companyId)
        .all<Record<string, string | number | null>>()
      return (rows.results ?? []).map((row) => ({
        user: mapUser({
          id: String(row.user_id),
          email: String(row.email),
          name: String(row.name ?? ''),
          last_company_id:
            typeof row.last_company_id === 'string' ? row.last_company_id : null,
          last_seen_at:
            typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
          created_at: String(row.user_created_at),
          updated_at: String(row.user_updated_at),
        }),
        role: mapRole({
          id: String(row.role_id),
          company_id: String(row.company_id),
          key: typeof row.key === 'string' ? row.key : null,
          name: String(row.role_name),
          permissions_json: String(row.permissions_json ?? '[]'),
          is_system: Number(row.is_system ?? 0),
          created_at: String(row.role_created_at),
          updated_at: String(row.role_updated_at),
        }),
        membership: mapMembership({
          id: String(row.membership_id),
          company_id: String(row.company_id),
          user_id: String(row.user_id),
          role_id: String(row.role_id),
          created_at: String(row.membership_created_at),
          updated_at: String(row.membership_updated_at),
        }),
      }))
    },

    async listMembershipsForUser(userId) {
      const rows = await db
        .prepare(
          `SELECT
             companies.id AS company_id, companies.name AS company_name, companies.slug,
             companies.created_at AS company_created_at, companies.updated_at AS company_updated_at,
             roles.id AS role_id, roles.key, roles.name AS role_name, roles.permissions_json,
             roles.is_system, roles.created_at AS role_created_at, roles.updated_at AS role_updated_at,
             memberships.id AS membership_id, memberships.user_id, memberships.created_at AS membership_created_at,
             memberships.updated_at AS membership_updated_at
           FROM memberships
           JOIN companies ON companies.id = memberships.company_id
           JOIN roles ON roles.id = memberships.role_id
           WHERE memberships.user_id = ?
           ORDER BY companies.name COLLATE NOCASE ASC`,
        )
        .bind(userId)
        .all<Record<string, string | number | null>>()
      return (rows.results ?? []).map((row) =>
        toMembershipView(row, userId),
      )
    },

    async getMembership(companyId, userId) {
      const row = await db
        .prepare(
          `SELECT
             companies.id AS company_id, companies.name AS company_name, companies.slug,
             companies.created_at AS company_created_at, companies.updated_at AS company_updated_at,
             roles.id AS role_id, roles.key, roles.name AS role_name, roles.permissions_json,
             roles.is_system, roles.created_at AS role_created_at, roles.updated_at AS role_updated_at,
             memberships.id AS membership_id, memberships.user_id, memberships.created_at AS membership_created_at,
             memberships.updated_at AS membership_updated_at
           FROM memberships
           JOIN companies ON companies.id = memberships.company_id
           JOIN roles ON roles.id = memberships.role_id
           WHERE memberships.company_id = ? AND memberships.user_id = ?`,
        )
        .bind(companyId, userId)
        .first<Record<string, string | number | null>>()
      return row ? toMembershipView(row, userId) : null
    },

    async getMembershipById(id) {
      const row = await db
        .prepare(
          `SELECT
             companies.id AS company_id, companies.name AS company_name, companies.slug,
             companies.created_at AS company_created_at, companies.updated_at AS company_updated_at,
             roles.id AS role_id, roles.key, roles.name AS role_name, roles.permissions_json,
             roles.is_system, roles.created_at AS role_created_at, roles.updated_at AS role_updated_at,
             memberships.id AS membership_id, memberships.user_id, memberships.created_at AS membership_created_at,
             memberships.updated_at AS membership_updated_at
           FROM memberships
           JOIN companies ON companies.id = memberships.company_id
           JOIN roles ON roles.id = memberships.role_id
           WHERE memberships.id = ?`,
        )
        .bind(id)
        .first<Record<string, string | number | null>>()
      if (!row) {
        return null
      }
      return toMembershipView(row, String(row.user_id))
    },

    async createMembership(record) {
      await db
        .prepare(
          `INSERT INTO memberships (id, company_id, user_id, role_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.companyId,
          record.userId,
          record.roleId,
          record.createdAt,
          record.updatedAt,
        )
        .run()
      return record
    },

    async updateMembershipRole(id, companyId, roleId, updatedAt) {
      const result = await db
        .prepare(
          `UPDATE memberships
           SET role_id = ?, updated_at = ?
           WHERE id = ? AND company_id = ?`,
        )
        .bind(roleId, updatedAt, id, companyId)
        .run()
      return (result.meta.changes ?? 0) > 0
    },

    async deleteMembership(id) {
      const result = await db
        .prepare('DELETE FROM memberships WHERE id = ?')
        .bind(id)
        .run()
      return (result.meta.changes ?? 0) > 0
    },

    async listRoles(companyId) {
      const rows = await db
        .prepare(
          'SELECT * FROM roles WHERE company_id = ? ORDER BY is_system DESC, name COLLATE NOCASE ASC',
        )
        .bind(companyId)
        .all<RoleRow>()
      return (rows.results ?? []).map(mapRole)
    },

    async getRole(id) {
      const row = await db
        .prepare('SELECT * FROM roles WHERE id = ?')
        .bind(id)
        .first<RoleRow>()
      return row ? mapRole(row) : null
    },

    async createRole(record) {
      await db
        .prepare(
          `INSERT INTO roles (
             id, company_id, key, name, permissions_json, is_system, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.companyId,
          record.key,
          record.name,
          JSON.stringify(record.permissions),
          record.isSystem ? 1 : 0,
          record.createdAt,
          record.updatedAt,
        )
        .run()
      return record
    },

    async updateRole(id, fields) {
      const row = await db
        .prepare(
          `UPDATE roles
           SET name = ?, permissions_json = ?, updated_at = ?
           WHERE id = ? AND is_system = 0
           RETURNING *`,
        )
        .bind(fields.name, JSON.stringify(fields.permissions), fields.updatedAt, id)
        .first<RoleRow>()
      return row ? mapRole(row) : null
    },

    async deleteRole(id) {
      const result = await db
        .prepare('DELETE FROM roles WHERE id = ? AND is_system = 0')
        .bind(id)
        .run()
      return (result.meta.changes ?? 0) > 0
    },

    async countMembershipsForRole(roleId) {
      const row = await db
        .prepare(
          'SELECT COUNT(*) AS count FROM memberships WHERE role_id = ?',
        )
        .bind(roleId)
        .first<{ count: number }>()
      return row?.count ?? 0
    },

    async countMembers(companyId) {
      const row = await db
        .prepare(
          'SELECT COUNT(*) AS count FROM memberships WHERE company_id = ?',
        )
        .bind(companyId)
        .first<{ count: number }>()
      return Number(row?.count ?? 0)
    },

    async deleteCompany(id) {
      const existing = await db
        .prepare('SELECT id FROM companies WHERE id = ?')
        .bind(id)
        .first<{ id: string }>()
      if (!existing) {
        return false
      }
      await db.batch([
        db.prepare('DELETE FROM memberships WHERE company_id = ?').bind(id),
        db.prepare('DELETE FROM roles WHERE company_id = ?').bind(id),
        db.prepare('DELETE FROM company_settings WHERE company_id = ?').bind(id),
        db.prepare('DELETE FROM company_secrets WHERE company_id = ?').bind(id),
        db.prepare('DELETE FROM invoice_sequences WHERE company_id = ?').bind(id),
        db.prepare('DELETE FROM people WHERE company_id = ?').bind(id),
        db.prepare('UPDATE users SET last_company_id = NULL WHERE last_company_id = ?').bind(id),
        db.prepare('DELETE FROM companies WHERE id = ?').bind(id),
      ])
      return true
    },

    async countUsers() {
      const row = await db
        .prepare('SELECT COUNT(*) AS count FROM users')
        .first<{ count: number }>()
      return row?.count ?? 0
    },
  }
}
