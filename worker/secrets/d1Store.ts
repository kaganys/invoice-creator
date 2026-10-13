import { decryptSecret, encryptSecret, tenantSecretsKey } from './cipher.ts'

export const SECRET_KEYS = [
  'stripe_secret',
  'stripe_webhook_secret',
  'smtp_password',
] as const

export type SecretKey = (typeof SECRET_KEYS)[number]

export function isSecretKey(value: string): value is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(value)
}

export type CompanySecretStore = {
  getCiphertext(companyId: string, key: SecretKey): Promise<string | null>
  setCiphertext(
    companyId: string,
    key: SecretKey,
    ciphertext: string,
    updatedAt: string,
  ): Promise<void>
  delete(companyId: string, key: SecretKey): Promise<void>
}

export function createD1CompanySecretStore(db: D1Database): CompanySecretStore {
  return {
    async getCiphertext(companyId, key) {
      const row = await db
        .prepare(
          'SELECT ciphertext FROM company_secrets WHERE company_id = ? AND key = ?',
        )
        .bind(companyId, key)
        .first<{ ciphertext: string }>()
      return row?.ciphertext ?? null
    },
    async setCiphertext(companyId, key, ciphertext, updatedAt) {
      await db
        .prepare(
          `INSERT INTO company_secrets (company_id, key, ciphertext, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(company_id, key) DO UPDATE SET
             ciphertext = excluded.ciphertext,
             updated_at = excluded.updated_at`,
        )
        .bind(companyId, key, ciphertext, updatedAt)
        .run()
    },
    async delete(companyId, key) {
      await db
        .prepare('DELETE FROM company_secrets WHERE company_id = ? AND key = ?')
        .bind(companyId, key)
        .run()
    },
  }
}

export async function readCompanySecret(
  store: CompanySecretStore | undefined,
  companyId: string | undefined,
  key: SecretKey,
  keyMaterial: string | undefined,
): Promise<string | null> {
  if (!store || !companyId || !keyMaterial) {
    return null
  }
  const blob = await store.getCiphertext(companyId, key)
  if (!blob) {
    return null
  }
  return decryptSecret(blob, keyMaterial)
}

export async function writeCompanySecret(
  store: CompanySecretStore,
  companyId: string,
  key: SecretKey,
  plain: string,
  keyMaterial: string,
  updatedAt: string,
): Promise<void> {
  const ciphertext = await encryptSecret(plain, keyMaterial)
  if (plain.length >= 8 && ciphertext.includes(plain)) {
    throw new Error('Refusing to store a company secret in plaintext.')
  }
  await store.setCiphertext(companyId, key, ciphertext, updatedAt)
}

export async function resolveCompanyOrPlatformSecret(
  store: CompanySecretStore | undefined,
  companyId: string | undefined,
  key: SecretKey,
  env: Env,
  platformValue: string | undefined,
): Promise<{ value: string | undefined; source: 'company' | 'platform' | 'none' }> {
  const companyValue = await readCompanySecret(
    store,
    companyId,
    key,
    tenantSecretsKey(env),
  )
  if (companyValue) {
    return { value: companyValue, source: 'company' }
  }
  if (platformValue) {
    return { value: platformValue, source: 'platform' }
  }
  return { value: undefined, source: 'none' }
}
