export function brandingBucket(env: Env): R2Bucket | undefined {
  return (env as Env & { BRANDING?: R2Bucket }).BRANDING
}

export function smtpPasswordSecret(env: Env): string | undefined {
  const value = (env as Env & { SMTP_PASSWORD?: string }).SMTP_PASSWORD
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function browserBinding(env: Env): Fetcher | undefined {
  return (env as Env & { BROWSER?: Fetcher }).BROWSER
}
