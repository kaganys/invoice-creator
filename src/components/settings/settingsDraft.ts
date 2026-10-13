import type { SmtpSettingsPayload } from '../../types/settings.ts'

export type SmtpComparable = Pick<
  SmtpSettingsPayload,
  | 'host'
  | 'port'
  | 'username'
  | 'security'
  | 'fromName'
  | 'fromEmail'
  | 'replyTo'
  | 'subjectTemplate'
  | 'bodyTemplate'
>

export function smtpFieldsChanged(
  saved: SmtpComparable,
  draft: SmtpComparable,
  password: string,
): boolean {
  if (password.trim()) {
    return true
  }
  return (
    saved.host !== draft.host ||
    Number(saved.port) !== Number(draft.port) ||
    saved.username !== draft.username ||
    saved.security !== draft.security ||
    saved.fromName !== draft.fromName ||
    saved.fromEmail !== draft.fromEmail ||
    saved.replyTo !== draft.replyTo ||
    saved.subjectTemplate !== draft.subjectTemplate ||
    saved.bodyTemplate !== draft.bodyTemplate
  )
}

export function brandingPreviewUrl(input: {
  savedUrl: string
  builtinUrl: string
  pendingObjectUrl: string | null
  restore: boolean
}): string {
  if (input.pendingObjectUrl) {
    return input.pendingObjectUrl
  }
  if (input.restore) {
    return input.builtinUrl
  }
  return input.savedUrl || input.builtinUrl
}
