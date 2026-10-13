import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

describe('repo security config files', () => {
  it('ignores local secret files but keeps example files versionable', () => {
    const gitignore = readRepoFile('.gitignore')

    expect(gitignore).toContain('.dev.vars')
    expect(gitignore).toContain('.dev.vars.*')
    expect(gitignore).toContain('!.dev.vars.example')
    expect(gitignore).toContain('.env')
    expect(gitignore).toContain('.env.*')
    expect(gitignore).toContain('!.env.example')
    expect(gitignore).toContain('dist')
  })

  it('ships a placeholder-only .dev.vars.example', () => {
    const example = readRepoFile('.dev.vars.example')

    expect(example).toBe(
      [
        'SMTP_PASSWORD=',
        'PAYMENT_LINK_KEY=',
        'STRIPE_SECRET_KEY=',
        'STRIPE_WEBHOOK_SECRET=',
        'TENANT_SECRETS_KEY=',
        'ACCESS_TEAM_DOMAIN=',
        'ACCESS_AUD=',
        'ONBOARD_INVITE_CODE=',
        'PUBLIC_PAYMENT_BASE_URL=https://pay.vrfnw.com',
        'DEV_ACCESS_EMAIL=dev@localhost',
        '',
      ].join('\n'),
    )
  })
})
