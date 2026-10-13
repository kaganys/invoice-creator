import { errorJson, json } from '../http.ts'
import { createEntityId, isUuid, nowIso } from '../lib/ids.ts'
import { asTrimmedString, isRecord, readJsonBody } from '../lib/json.ts'
import type { InvoiceStore } from '../invoices/types.ts'
import type { DirectoryStore } from '../people/types.ts'
import { resolveDefaultFromId } from '../people/validation.ts'
import {
  parseDefaultsJson,
  publicDefaultsForApi,
  serializeDefaults,
  validateDefaultsWrite,
} from './defaults.ts'
import { DEFAULT_FROM_SETTING_KEY, SETTINGS_KEYS } from './keys.ts'
import {
  currentUtcYear,
  formatInvoiceNumber,
  parseNumberingJson,
  publicNumbering,
  serializeNumbering,
  validateNextSequence,
  validateNumberingWrite,
} from './numbering.ts'
import {
  assetForKind,
  brandingFileUrl,
  builtinPath,
  isBrandingKind,
  isSafeObjectKey,
  parseBrandingJson,
  publicAsset,
  publicBranding,
  safeObjectKey,
  serializeBranding,
  validateUploadBytes,
  withAsset,
} from './branding.ts'
import {
  parseSmtpJson,
  publicSmtp,
  serializeSmtp,
  smtpPasswordConfigured,
  validateSmtpWrite,
} from './smtp.ts'
import {
  parseFormatJson,
  publicFormat,
  serializeFormat,
} from './format.ts'
import { validateInvoiceFormat } from '../../src/invoice/format.ts'
import {
  applyEmailTemplate,
  containsHeaderInjection,
  defaultEmailTemplates,
} from '../../src/invoice/emailTemplates.ts'
import type { MailTransport } from '../mail/types.ts'
import { createSmtpTransport } from '../mail/smtpTransport.ts'
import {
  parsePaymentsJson,
  publicPayments,
  serializePayments,
  validatePaymentsWrite,
} from './payments.ts'
import type { ObjectStore, SequenceStore, SettingsKvStore, SmtpConfig } from './types.ts'
import {
  readCompanySecret,
  writeCompanySecret,
  type CompanySecretStore,
  type SecretKey,
} from '../secrets/d1Store.ts'


export type SettingsDeps = {
  settings: SettingsKvStore
  sequences: SequenceStore
  people: Pick<DirectoryStore, 'getPerson'>
  invoices: Pick<InvoiceStore, 'findIdByNumber'>
  objects?: ObjectStore
  smtpPassword?: string
  clock?: () => string
  now?: () => Date
  idFactory?: () => string
  mailFactory?: (config: SmtpConfig, password: string) => MailTransport
  stripeSecret?: string
  stripeWebhookSecret?: string
  tenantSecretsKey?: string
  secrets?: CompanySecretStore
  companyId?: string
}

async function loadDefaultFromId(
  deps: SettingsDeps,
): Promise<string | null> {
  const storedId = await deps.settings.get(DEFAULT_FROM_SETTING_KEY)
  if (!storedId) {
    return null
  }
  const person = await deps.people.getPerson(storedId)
  const resolved = resolveDefaultFromId(storedId, Boolean(person))
  if (resolved !== storedId) {
    const clock = deps.clock ?? nowIso
    await deps.settings.set(DEFAULT_FROM_SETTING_KEY, null, clock())
  }
  return resolved
}

async function loadDefaults(deps: SettingsDeps) {
  const [raw, defaultFromId] = await Promise.all([
    deps.settings.get(SETTINGS_KEYS.defaults),
    loadDefaultFromId(deps),
  ])
  return { ...parseDefaultsJson(raw), defaultFromId }
}

async function loadNumbering(deps: SettingsDeps) {
  const [raw, nextSequence] = await Promise.all([
    deps.settings.get(SETTINGS_KEYS.numbering),
    deps.sequences.getNextSequence(),
  ])
  return { config: parseNumberingJson(raw), nextSequence }
}

async function loadBranding(deps: SettingsDeps) {
  const raw = await deps.settings.get(SETTINGS_KEYS.branding)
  return parseBrandingJson(raw, deps.companyId)
}

async function loadSmtp(deps: SettingsDeps) {
  const raw = await deps.settings.get(SETTINGS_KEYS.smtp)
  return parseSmtpJson(raw)
}

export async function getAllSettings(deps: SettingsDeps): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))()
  const [defaults, numbering, branding, smtp, format, payments] = await Promise.all([
    loadDefaults(deps),
    loadNumbering(deps),
    loadBranding(deps),
    loadSmtp(deps),
    loadFormat(deps),
    loadPayments(deps),
  ])
  return json({
    defaultFromId: defaults.defaultFromId,
    defaults: publicDefaultsForApi(defaults),
    numbering: publicNumbering(numbering.config, numbering.nextSequence, now),
    branding: publicBranding(branding),
    smtp: publicSmtp(smtp, smtpPasswordConfigured(deps.smtpPassword)),
    format: publicFormat(format),
    payments: publicPayments(
      payments,
      typeof deps.stripeSecret === 'string' && deps.stripeSecret.length > 0,
    ),
  })
}

async function loadPayments(deps: SettingsDeps) {
  const raw = await deps.settings.get(SETTINGS_KEYS.payments)
  return parsePaymentsJson(raw)
}

async function loadFormat(deps: SettingsDeps) {
  const raw = await deps.settings.get(SETTINGS_KEYS.format)
  return parseFormatJson(raw)
}

export async function getDefaults(deps: SettingsDeps): Promise<Response> {
  const defaults = await loadDefaults(deps)
  return json({
    defaultFromId: defaults.defaultFromId,
    defaults: publicDefaultsForApi(defaults),
  })
}

export async function updateDefaults(
  request: Request,
  deps: SettingsDeps,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  const parsed = validateDefaultsWrite(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }

  if (parsed.value.defaultFromId) {
    if (!isUuid(parsed.value.defaultFromId)) {
      return errorJson('Invalid defaultFromId.', 400)
    }
    const person = await deps.people.getPerson(parsed.value.defaultFromId)
    if (!person) {
      return errorJson('defaultFromId must refer to an existing person.', 400)
    }
  }

  const clock = deps.clock ?? nowIso
  const timestamp = clock()
  await Promise.all([
    deps.settings.set(
      SETTINGS_KEYS.defaults,
      serializeDefaults(parsed.value),
      timestamp,
    ),
    deps.settings.set(
      DEFAULT_FROM_SETTING_KEY,
      parsed.value.defaultFromId,
      timestamp,
    ),
  ])

  return json({
    defaultFromId: parsed.value.defaultFromId,
    defaults: publicDefaultsForApi(parsed.value),
  })
}

export async function getNumberingSettings(
  deps: SettingsDeps,
): Promise<Response> {
  const numbering = await loadNumbering(deps)
  const now = (deps.now ?? (() => new Date()))()
  return json({
    numbering: publicNumbering(numbering.config, numbering.nextSequence, now),
  })
}

export async function updateNumberingSettings(
  request: Request,
  deps: SettingsDeps,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  const parsed = validateNumberingWrite(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }
  const clock = deps.clock ?? nowIso
  await deps.settings.set(
    SETTINGS_KEYS.numbering,
    serializeNumbering(parsed.value),
    clock(),
  )
  const nextSequence = await deps.sequences.getNextSequence()
  const now = (deps.now ?? (() => new Date()))()
  return json({
    numbering: publicNumbering(parsed.value, nextSequence, now),
  })
}

export async function changeNextSequence(
  request: Request,
  deps: SettingsDeps,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  const parsed = validateNextSequence(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }

  const numbering = await loadNumbering(deps)
  const now = (deps.now ?? (() => new Date()))()
  const example = formatInvoiceNumber(
    numbering.config,
    parsed.value,
    currentUtcYear(now),
  )
  const existing = await deps.invoices.findIdByNumber(example)
  if (existing) {
    return errorJson(
      `Next sequence ${parsed.value} would produce ${example}, which already exists.`,
      409,
    )
  }

  await deps.sequences.setNextSequence(parsed.value)
  return json({
    numbering: publicNumbering(numbering.config, parsed.value, now),
  })
}

export async function allocateInvoiceNumber(
  deps: SettingsDeps,
): Promise<Response> {
  const numbering = await loadNumbering(deps)
  const now = (deps.now ?? (() => new Date()))()
  const year = currentUtcYear(now)

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sequence = await deps.sequences.allocateSequence()
    const number = formatInvoiceNumber(numbering.config, sequence, year)
    const existing = await deps.invoices.findIdByNumber(number)
    if (!existing) {
      return json({ number, sequence })
    }
  }

  return errorJson('Could not allocate a unique invoice number.', 409)
}

export async function getBrandingSettings(
  deps: SettingsDeps,
): Promise<Response> {
  const branding = await loadBranding(deps)
  return json({ branding: publicBranding(branding) })
}

export async function uploadBrandingAsset(
  request: Request,
  kindParam: string,
  deps: SettingsDeps,
): Promise<Response> {
  if (!isBrandingKind(kindParam)) {
    return errorJson('Unknown branding asset.', 400)
  }
  if (!deps.objects) {
    return errorJson(
      'R2 branding bucket is not configured. Create bitz-designs-branding and bind it as BRANDING.',
      503,
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return errorJson('Expected multipart form data with a file field.', 400)
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return errorJson('A file field is required.', 400)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const validated = validateUploadBytes(bytes, file.type || '')
  if (!validated.ok) {
    return errorJson(validated.message, 400)
  }

  const idFactory = deps.idFactory ?? createEntityId
  const objectKey = safeObjectKey(
    kindParam,
    idFactory(),
    validated.value.ext,
    deps.companyId,
  )
  await deps.objects.put(objectKey, bytes, validated.value.contentType)

  const current = await loadBranding(deps)
  const next = withAsset(current, kindParam, brandingFileUrl(objectKey))
  const clock = deps.clock ?? nowIso
  await deps.settings.set(SETTINGS_KEYS.branding, serializeBranding(next), clock())

  return json({
    branding: publicBranding(next),
    asset: publicAsset(kindParam, assetForKind(next, kindParam)),
  })
}

export async function restoreBrandingAsset(
  kindParam: string,
  deps: SettingsDeps,
): Promise<Response> {
  if (!isBrandingKind(kindParam)) {
    return errorJson('Unknown branding asset.', 400)
  }
  const current = await loadBranding(deps)
  const next = withAsset(current, kindParam, builtinPath(kindParam))
  const clock = deps.clock ?? nowIso
  await deps.settings.set(SETTINGS_KEYS.branding, serializeBranding(next), clock())
  return json({ branding: publicBranding(next) })
}

export async function serveBrandingFile(
  keyParam: string,
  deps: SettingsDeps,
): Promise<Response> {
  let key: string
  try {
    key = decodeURIComponent(keyParam)
  } catch {
    return errorJson('Invalid branding object key.', 400)
  }
  if (!isSafeObjectKey(key)) {
    return errorJson('Invalid branding object key.', 400)
  }
  if (!deps.objects) {
    return errorJson('R2 branding bucket is not configured.', 503)
  }
  const object = await deps.objects.get(key)
  if (!object) {
    return errorJson('Branding file not found.', 404)
  }
  return new Response(object.body, {
    headers: {
      'content-type': object.contentType,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  })
}

export async function getSmtpSettings(deps: SettingsDeps): Promise<Response> {
  const smtp = await loadSmtp(deps)
  const password = await effectiveNamedSecret(deps, 'smtp_password', deps.smtpPassword)
  return json({
    smtp: publicSmtp(
      smtp,
      smtpPasswordConfigured(password.value),
      password.source,
    ),
  })
}

export async function updateSmtpSettings(
  request: Request,
  deps: SettingsDeps,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  const password = isRecord(body.value) ? asTrimmedString(body.value.password) : ''
  const clearPassword =
    isRecord(body.value) && body.value.clearPassword === true
  const settingsBody = isRecord(body.value) ? { ...body.value } : body.value
  if (isRecord(settingsBody)) {
    delete settingsBody.password
    delete settingsBody.clearPassword
  }
  const parsed = validateSmtpWrite(settingsBody)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }
  const stored = await storeOptionalSecret(deps, 'smtp_password', password, clearPassword)
  if (!stored.ok) {
    return stored.response
  }
  const clock = deps.clock ?? nowIso
  await deps.settings.set(SETTINGS_KEYS.smtp, serializeSmtp(parsed.value), clock())
  const effective = await effectiveNamedSecret(deps, 'smtp_password', deps.smtpPassword)
  return json({
    smtp: publicSmtp(
      parsed.value,
      smtpPasswordConfigured(effective.value),
      effective.source,
    ),
  })
}

export async function getFormatSettings(deps: SettingsDeps): Promise<Response> {
  const format = await loadFormat(deps)
  return json({ format: publicFormat(format) })
}

export async function updateFormatSettings(
  request: Request,
  deps: SettingsDeps,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  const parsed = validateInvoiceFormat(body.value)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }
  const clock = deps.clock ?? nowIso
  await deps.settings.set(SETTINGS_KEYS.format, serializeFormat(parsed.value), clock())
  return json({ format: publicFormat(parsed.value) })
}

export async function getPaymentsSettings(deps: SettingsDeps): Promise<Response> {
  const payments = await loadPayments(deps)
  const stripe = await effectiveNamedSecret(deps, 'stripe_secret', deps.stripeSecret)
  const webhook = await effectiveNamedSecret(
    deps,
    'stripe_webhook_secret',
    deps.stripeWebhookSecret,
  )
  return json({
    payments: publicPayments(payments, Boolean(stripe.value), {
      webhookSecretConfigured: Boolean(webhook.value),
      secretSource: stripe.source,
    }),
  })
}

export async function updatePaymentsSettings(
  request: Request,
  deps: SettingsDeps,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  const secretKey = isRecord(body.value) ? asTrimmedString(body.value.secretKey) : ''
  const webhookSecret = isRecord(body.value)
    ? asTrimmedString(body.value.webhookSecret)
    : ''
  const clearSecret = isRecord(body.value) && body.value.clearSecret === true
  const clearWebhook = isRecord(body.value) && body.value.clearWebhookSecret === true
  if (secretKey && !secretKey.startsWith('sk_')) {
    return errorJson('Stripe secret key must start with sk_.', 400)
  }
  if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
    return errorJson('Stripe webhook secret must start with whsec_.', 400)
  }
  const settingsBody = isRecord(body.value) ? { ...body.value } : body.value
  if (isRecord(settingsBody)) {
    delete settingsBody.secretKey
    delete settingsBody.webhookSecret
    delete settingsBody.clearSecret
    delete settingsBody.clearWebhookSecret
  }
  const parsed = validatePaymentsWrite(settingsBody)
  if (!parsed.ok) {
    return errorJson(parsed.message, 400)
  }
  const storedSecret = await storeOptionalSecret(
    deps,
    'stripe_secret',
    secretKey,
    clearSecret,
  )
  if (!storedSecret.ok) {
    return storedSecret.response
  }
  const storedWebhook = await storeOptionalSecret(
    deps,
    'stripe_webhook_secret',
    webhookSecret,
    clearWebhook,
  )
  if (!storedWebhook.ok) {
    return storedWebhook.response
  }
  const clock = deps.clock ?? nowIso
  await deps.settings.set(
    SETTINGS_KEYS.payments,
    serializePayments(parsed.value),
    clock(),
  )
  const stripe = await effectiveNamedSecret(deps, 'stripe_secret', deps.stripeSecret)
  const webhook = await effectiveNamedSecret(
    deps,
    'stripe_webhook_secret',
    deps.stripeWebhookSecret,
  )
  return json({
    payments: publicPayments(parsed.value, Boolean(stripe.value), {
      webhookSecretConfigured: Boolean(webhook.value),
      secretSource: stripe.source,
    }),
  })
}

async function effectiveNamedSecret(
  deps: SettingsDeps,
  key: SecretKey,
  platformValue: string | undefined,
): Promise<{ value: string | undefined; source: 'company' | 'platform' | 'none' }> {
  const companyValue = await readCompanySecret(
    deps.secrets,
    deps.companyId,
    key,
    deps.tenantSecretsKey,
  )
  if (companyValue) {
    return { value: companyValue, source: 'company' }
  }
  if (platformValue) {
    return { value: platformValue, source: 'platform' }
  }
  return { value: undefined, source: 'none' }
}

async function storeOptionalSecret(
  deps: SettingsDeps,
  key: SecretKey,
  plain: string,
  clear: boolean,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!plain && !clear) {
    return { ok: true }
  }
  if (!deps.secrets || !deps.companyId) {
    return {
      ok: false,
      response: errorJson('Company secret storage is not available.', 503),
    }
  }
  if (clear && !plain) {
    await deps.secrets.delete(deps.companyId, key)
    return { ok: true }
  }
  if (!deps.tenantSecretsKey) {
    return {
      ok: false,
      response: errorJson(
        'Set the TENANT_SECRETS_KEY Worker secret before saving company credentials.',
        503,
      ),
    }
  }
  await writeCompanySecret(
    deps.secrets,
    deps.companyId,
    key,
    plain,
    deps.tenantSecretsKey,
    (deps.clock ?? nowIso)(),
  )
  return { ok: true }
}

const TEST_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function testSmtpSettings(
  request: Request,
  deps: SettingsDeps,
): Promise<Response> {
  const smtp = await loadSmtp(deps)
  if (!smtp.host) {
    return errorJson('SMTP host is required before testing.', 400)
  }
  if (!smtp.fromEmail) {
    return errorJson('Default From email is required before testing.', 400)
  }
  if (smtp.port === 25) {
    return errorJson('Outbound SMTP on port 25 is not supported.', 400)
  }
  const resolvedPassword = await effectiveNamedSecret(
    deps,
    'smtp_password',
    deps.smtpPassword,
  )
  const smtpPassword = resolvedPassword.value
  if (!smtpPasswordConfigured(smtpPassword)) {
    return errorJson(
      'SMTP password is not configured. Save one for this company, or set the SMTP_PASSWORD Worker secret.',
      400,
    )
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return body.response
  }
  if (!isRecord(body.value)) {
    return errorJson('SMTP test data must be a JSON object.', 400)
  }
  const to = asTrimmedString(body.value.to)
  if (!TEST_EMAIL.test(to) || containsHeaderInjection(to)) {
    return errorJson(
      'Enter a valid test recipient. This sends a real email.',
      400,
    )
  }
  if (containsHeaderInjection(smtp.fromName) || containsHeaderInjection(smtp.fromEmail)) {
    return errorJson('SMTP From values cannot contain line breaks.', 400)
  }

  const templates = defaultEmailTemplates()
  const subject = applyEmailTemplate('SMTP test from {{business_name}}', {
    invoice_number: '',
    customer_name: '',
    business_name: smtp.fromName || 'Bitz Designs',
    amount: '',
    due_date: '',
    zelle_email: '',
    payment_memo: '',
    payment_url: '',
  })
  const text = `This is a real SMTP test from the Bitz Designs invoicing application.\n\nIf you received this, the configured SMTP host can deliver mail.\n\n${templates.subject}`

  const mailFactory =
    deps.mailFactory ??
    ((config, password) => createSmtpTransport(config, password))
  try {
    await mailFactory(smtp, smtpPassword ?? '').send({
      fromName: smtp.fromName || 'Bitz Designs',
      fromEmail: smtp.fromEmail,
      replyTo: smtp.replyTo || undefined,
      to,
      subject,
      text,
    })
    return json({
      ok: true,
      delivered: true,
      to,
      message: `Test email sent to ${to}.`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMTP test failed.'
    return errorJson(message, 502)
  }
}
