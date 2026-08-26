export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8')
  }
  if (!headers.has('cache-control')) {
    headers.set('cache-control', 'no-store, no-cache, private, max-age=0')
  }
  if (!headers.has('cdn-cache-control')) {
    headers.set('cdn-cache-control', 'no-store')
  }

  return Response.json(data, {
    ...init,
    headers,
  })
}

export function errorJson(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return json(
    {
      ok: false,
      error: message,
      ...extra,
    },
    { status },
  )
}
