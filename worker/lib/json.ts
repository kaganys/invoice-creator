import { errorJson } from '../http.ts'

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  let text: string
  try {
    text = await request.text()
  } catch {
    return {
      ok: false,
      response: errorJson('Could not read request body', 400),
    }
  }

  if (!text.trim()) {
    return {
      ok: false,
      response: errorJson('Request body is required', 400),
    }
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return {
      ok: false,
      response: errorJson('Malformed JSON', 400),
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
