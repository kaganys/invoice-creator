import { describe, expect, it } from 'vitest'
import {
  apiAllowedForRole,
  isPublicApiPath,
  isPublicPaymentPagePath,
  pageAllowedForRole,
} from './access.ts'
import { classifyHostname } from './hostRole.ts'

describe('hostname roles', () => {
  it('maps production and local hosts', () => {
    expect(classifyHostname('invoice.vrfnw.com')).toBe('admin')
    expect(classifyHostname('pay.vrfnw.com')).toBe('public')
    expect(classifyHostname('localhost')).toBe('dev')
    expect(classifyHostname('127.0.0.1')).toBe('dev')
    expect(classifyHostname('invoice-creator.saulk.workers.dev')).toBe('locked')
    expect(classifyHostname('evil.example.com')).toBe('locked')
  })
})

describe('pay.vrfnw.com access', () => {
  const role = 'public' as const

  it('allows payment page, public APIs, webhook, and branding file reads', () => {
    expect(isPublicPaymentPagePath('/i/abcTOK_en-value01234567890123456789012')).toBe(
      true,
    )
    expect(pageAllowedForRole(role, '/i/abcTOK_en-value01234567890123456789012')).toBe(
      true,
    )
    expect(pageAllowedForRole(role, '/')).toBe(true)
    expect(
      pageAllowedForRole(
        role,
        '/.well-known/apple-developer-merchantid-domain-association',
      ),
    ).toBe(true)
    expect(apiAllowedForRole(role, '/api/public/invoices/tok')).toBe(true)
    expect(apiAllowedForRole(role, '/api/public/invoices/tok/payment-intent')).toBe(
      true,
    )
    expect(apiAllowedForRole(role, '/api/webhooks/stripe')).toBe(true)
    expect(apiAllowedForRole(role, '/api/branding/file/invoice-logo.png')).toBe(
      true,
    )
    expect(isPublicApiPath('/api/webhooks/stripe')).toBe(true)
  })

  it('blocks admin SPA paths and admin APIs', () => {
    expect(pageAllowedForRole(role, '/settings')).toBe(false)
    expect(pageAllowedForRole(role, '/invoices')).toBe(false)
    expect(pageAllowedForRole(role, '/people')).toBe(false)
    expect(pageAllowedForRole(role, '/invoice')).toBe(false)
    expect(apiAllowedForRole(role, '/api/invoices')).toBe(false)
    expect(apiAllowedForRole(role, '/api/invoices/abc')).toBe(false)
    expect(apiAllowedForRole(role, '/api/settings')).toBe(false)
    expect(apiAllowedForRole(role, '/api/settings/smtp')).toBe(false)
    expect(apiAllowedForRole(role, '/api/people')).toBe(false)
    expect(apiAllowedForRole(role, '/api/invoices/abc/emails')).toBe(false)
    expect(apiAllowedForRole(role, '/api/invoices/abc/payment-link')).toBe(false)
    expect(apiAllowedForRole(role, '/api/health')).toBe(false)
  })
})

describe('invoice.vrfnw.com access', () => {
  it('allows admin APIs and SPA paths', () => {
    const role = 'admin' as const
    expect(apiAllowedForRole(role, '/api/invoices')).toBe(true)
    expect(apiAllowedForRole(role, '/api/settings')).toBe(true)
    expect(apiAllowedForRole(role, '/api/people')).toBe(true)
    expect(apiAllowedForRole(role, '/api/public/invoices/tok')).toBe(true)
    expect(pageAllowedForRole(role, '/')).toBe(true)
    expect(pageAllowedForRole(role, '/settings')).toBe(true)
  })
})

describe('workers.dev access', () => {
  it('cannot bypass Cloudflare Access for admin APIs or pages', () => {
    const role = 'locked' as const
    expect(apiAllowedForRole(role, '/api/invoices')).toBe(false)
    expect(apiAllowedForRole(role, '/api/settings')).toBe(false)
    expect(apiAllowedForRole(role, '/api/people')).toBe(false)
    expect(apiAllowedForRole(role, '/api/public/invoices/tok')).toBe(false)
    expect(apiAllowedForRole(role, '/api/webhooks/stripe')).toBe(false)
    expect(pageAllowedForRole(role, '/')).toBe(false)
    expect(pageAllowedForRole(role, '/i/token')).toBe(false)
  })
})

describe('localhost development', () => {
  it('keeps full local access', () => {
    const role = 'dev' as const
    expect(classifyHostname('localhost')).toBe('dev')
    expect(apiAllowedForRole(role, '/api/invoices')).toBe(true)
    expect(apiAllowedForRole(role, '/api/public/invoices/tok')).toBe(true)
    expect(pageAllowedForRole(role, '/')).toBe(true)
    expect(pageAllowedForRole(role, '/i/token')).toBe(true)
    expect(pageAllowedForRole(role, '/settings')).toBe(true)
  })
})
