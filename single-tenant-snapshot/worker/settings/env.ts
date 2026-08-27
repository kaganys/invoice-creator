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

export function publicPaymentBaseUrlConfig(env: Env): string | undefined {
  const value = (env as Env & { PUBLIC_PAYMENT_BASE_URL?: string })
    .PUBLIC_PAYMENT_BASE_URL
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function paymentLinkKeySecret(env: Env): string | undefined {
  const value = (env as Env & { PAYMENT_LINK_KEY?: string }).PAYMENT_LINK_KEY
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function stripeSecretKey(env: Env): string | undefined {
  const value = (env as Env & { STRIPE_SECRET_KEY?: string }).STRIPE_SECRET_KEY
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function stripeWebhookSecret(env: Env): string | undefined {
  const value = (env as Env & { STRIPE_WEBHOOK_SECRET?: string })
    .STRIPE_WEBHOOK_SECRET
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
