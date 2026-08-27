const DEFAULT_TOLERANCE_SECONDS = 300

export type SignatureResult =
  | { ok: true; timestamp: number }
  | { ok: false; message: string }

export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): Promise<SignatureResult> {
  if (!secret) {
    return { ok: false, message: 'Stripe webhook secret is not configured.' }
  }
  if (!signatureHeader) {
    return { ok: false, message: 'Missing Stripe-Signature header.' }
  }

  const parts = parseSignatureHeader(signatureHeader)
  if (!parts.timestamp || parts.v1.length === 0) {
    return { ok: false, message: 'Invalid Stripe-Signature header.' }
  }
  if (Math.abs(nowSeconds - parts.timestamp) > toleranceSeconds) {
    return { ok: false, message: 'Stripe signature timestamp is outside the allowed tolerance.' }
  }

  const expected = await hmacSha256Hex(secret, `${parts.timestamp}.${rawBody}`)
  const matched = parts.v1.some((candidate) => timingSafeEqual(candidate, expected))
  if (!matched) {
    return { ok: false, message: 'Invalid Stripe signature.' }
  }
  return { ok: true, timestamp: parts.timestamp }
}

export async function signStripeWebhookPayload(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  const digest = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)
  return `t=${timestamp},v1=${digest}`
}

function parseSignatureHeader(header: string): { timestamp: number; v1: string[] } {
  let timestamp = 0
  const v1: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key === 't') {
      timestamp = Number(value)
    }
    if (key === 'v1' && value) {
      v1.push(value)
    }
  }
  return { timestamp, v1 }
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  )
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }
  let mismatch = 0
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return mismatch === 0
}
