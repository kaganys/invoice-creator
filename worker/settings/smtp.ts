import {
  defaultEmailTemplates,
  validateEmailTemplates,
} from '../../src/invoice/emailTemplates.ts'
import { asTrimmedString, isRecord } from '../lib/json.ts'
import type { SmtpConfig, SmtpSecurity } from './types.ts'
import type { ValidationResult } from '../invoices/validation.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SECURITY_VALUES: SmtpSecurity[] = ['none', 'starttls', 'ssl']

const DEFAULT_TEMPLATES = defaultEmailTemplates()

export const DEFAULT_SMTP: SmtpConfig = {
  host: '',
  port: 587,
  username: '',
  security: 'starttls',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  subjectTemplate: DEFAULT_TEMPLATES.subject,
  bodyTemplate: DEFAULT_TEMPLATES.body,
}

export function parseSmtpJson(raw: string | null): SmtpConfig {
  if (!raw) {
    return { ...DEFAULT_SMTP }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return { ...DEFAULT_SMTP }
    }
    const securityRaw = asTrimmedString(parsed.security)
    const security = SECURITY_VALUES.includes(securityRaw as SmtpSecurity)
      ? (securityRaw as SmtpSecurity)
      : DEFAULT_SMTP.security
    const port =
      typeof parsed.port === 'number' && Number.isInteger(parsed.port)
        ? parsed.port
        : DEFAULT_SMTP.port
    const templates = validateEmailTemplates({
      subject: parsed.subjectTemplate,
      body: parsed.bodyTemplate,
    })
    const templateValue = templates.ok ? templates.value : defaultEmailTemplates()
    return {
      host: asTrimmedString(parsed.host),
      port: port >= 1 && port <= 65535 ? port : DEFAULT_SMTP.port,
      username: asTrimmedString(parsed.username),
      security,
      fromName: asTrimmedString(parsed.fromName),
      fromEmail: asTrimmedString(parsed.fromEmail),
      replyTo: asTrimmedString(parsed.replyTo),
      subjectTemplate: templateValue.subject,
      bodyTemplate: templateValue.body,
    }
  } catch {
    return { ...DEFAULT_SMTP }
  }
}

export function serializeSmtp(config: SmtpConfig): string {
  return JSON.stringify(config)
}

export function publicSmtp(config: SmtpConfig, passwordConfigured: boolean) {
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    security: config.security,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    replyTo: config.replyTo,
    subjectTemplate: config.subjectTemplate,
    bodyTemplate: config.bodyTemplate,
    passwordConfigured,
  }
}

function parsePort(raw: unknown): ValidationResult<number> {
  let value: number
  if (typeof raw === 'number') {
    value = raw
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    if (!/^[0-9]+$/.test(raw.trim())) {
      return { ok: false, message: 'SMTP port must be a whole number.' }
    }
    value = Number(raw.trim())
  } else {
    return { ok: false, message: 'SMTP port is required.' }
  }
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return { ok: false, message: 'SMTP port must be between 1 and 65535.' }
  }
  if (value === 25) {
    return {
      ok: false,
      message: 'Outbound SMTP on port 25 is not supported. Use 465, 587, or 2525.',
    }
  }
  return { ok: true, value }
}

export function validateSmtpWrite(input: unknown): ValidationResult<SmtpConfig> {
  if (!isRecord(input)) {
    return { ok: false, message: 'SMTP settings must be a JSON object.' }
  }

  if ('password' in input && input.password != null && input.password !== '') {
    return {
      ok: false,
      message:
        'SMTP password cannot be sent or stored through this API. Set the SMTP_PASSWORD Worker secret with Wrangler.',
    }
  }

  const host = asTrimmedString(input.host)
  if (host.length > 255) {
    return { ok: false, message: 'SMTP host is too long.' }
  }
  if (host.includes(' ')) {
    return { ok: false, message: 'SMTP host must not contain spaces.' }
  }

  const port = parsePort(input.port)
  if (!port.ok) {
    return port
  }

  const securityRaw = asTrimmedString(input.security) || 'starttls'
  if (!SECURITY_VALUES.includes(securityRaw as SmtpSecurity)) {
    return {
      ok: false,
      message: 'Connection security must be none, starttls, or ssl.',
    }
  }

  const fromEmail = asTrimmedString(input.fromEmail)
  if (fromEmail && !EMAIL_PATTERN.test(fromEmail)) {
    return { ok: false, message: 'Default From email is not valid.' }
  }
  const replyTo = asTrimmedString(input.replyTo)
  if (replyTo && !EMAIL_PATTERN.test(replyTo)) {
    return { ok: false, message: 'Reply-To email is not valid.' }
  }

  const templates = validateEmailTemplates({
    subject: input.subjectTemplate,
    body: input.bodyTemplate,
  })
  if (!templates.ok) {
    return templates
  }

  return {
    ok: true,
    value: {
      host,
      port: port.value,
      username: asTrimmedString(input.username),
      security: securityRaw as SmtpSecurity,
      fromName: asTrimmedString(input.fromName),
      fromEmail,
      replyTo,
      subjectTemplate: templates.value.subject,
      bodyTemplate: templates.value.body,
    },
  }
}

export function smtpPasswordConfigured(secret: string | undefined): boolean {
  return typeof secret === 'string' && secret.length > 0
}
