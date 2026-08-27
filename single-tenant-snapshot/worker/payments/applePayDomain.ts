const APPLE_PAY_ASSOCIATION_PATH =
  '/.well-known/apple-developer-merchantid-domain-association'

const STRIPE_APPLE_PAY_FILE =
  'https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association'

let cachedFile: { body: string; fetchedAt: number } | null = null
const CACHE_MS = 24 * 60 * 60 * 1000

export function isApplePayDomainFilePath(pathname: string): boolean {
  return pathname === APPLE_PAY_ASSOCIATION_PATH
}

export async function serveApplePayAssociationFile(): Promise<Response> {
  const now = Date.now()
  if (cachedFile && now - cachedFile.fetchedAt < CACHE_MS) {
    return associationResponse(cachedFile.body)
  }
  try {
    const upstream = await fetch(STRIPE_APPLE_PAY_FILE, {
      signal: AbortSignal.timeout(5000),
    })
    if (!upstream.ok) {
      throw new Error(`Stripe association file HTTP ${upstream.status}`)
    }
    const body = await upstream.text()
    if (!body.trim()) {
      throw new Error('Stripe association file was empty.')
    }
    cachedFile = { body, fetchedAt: now }
    return associationResponse(body)
  } catch {
    if (cachedFile) {
      return associationResponse(cachedFile.body)
    }
    return new Response('Apple Pay domain file is unavailable.', {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }
}

function associationResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'public, max-age=86400',
    },
  })
}
