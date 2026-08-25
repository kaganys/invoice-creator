export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8')
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
