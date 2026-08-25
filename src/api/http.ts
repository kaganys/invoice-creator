export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string' &&
      payload.error.trim()
    ) {
      return payload.error
    }
  } catch {
    // Fall through to status text.
  }
  return response.statusText || `Request failed (${response.status})`
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(path, {
    ...init,
    headers,
  })

  if (response.status === 204) {
    return undefined as T
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  return (await response.json()) as T
}
