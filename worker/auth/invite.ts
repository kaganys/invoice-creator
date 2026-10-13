import { classifyHostname } from '../hosting/hostRole.ts'

export function onboardInviteCode(env: Env): string {
  const value = (env as Env & { ONBOARD_INVITE_CODE?: string }).ONBOARD_INVITE_CODE
  return typeof value === 'string' ? value.trim() : ''
}

export function inviteAllowsOnboard(
  hostname: string,
  env: Env,
  provided: string,
): boolean {
  const configured = onboardInviteCode(env)
  if (!configured) {
    return classifyHostname(hostname) === 'dev'
  }
  return timingSafeEqual(provided.trim(), configured)
}

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder()
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.max(a.length, b.length)
  let mismatch = a.length === b.length ? 0 : 1
  for (let i = 0; i < length; i += 1) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return mismatch === 0
}
