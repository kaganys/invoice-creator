import { describe, expect, it } from 'vitest'
import {
  classifyBrowserHostname,
  publicPaymentTokenFromPath,
} from './siteHost.ts'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG' // 43 chars

describe('publicPaymentTokenFromPath', () => {
  it('reads /i/:token with or without a trailing slash', () => {
    expect(publicPaymentTokenFromPath(`/i/${TOKEN}`)).toBe(TOKEN)
    expect(publicPaymentTokenFromPath(`/i/${TOKEN}/`)).toBe(TOKEN)
  })

  it('accepts a bare 43-character token path', () => {
    expect(publicPaymentTokenFromPath(`/${TOKEN}`)).toBe(TOKEN)
  })

  it('returns null for the public landing path', () => {
    expect(publicPaymentTokenFromPath('/')).toBeNull()
    expect(publicPaymentTokenFromPath('/settings')).toBeNull()
  })
})

describe('classifyBrowserHostname', () => {
  it('maps pay and invoice hosts', () => {
    expect(classifyBrowserHostname('pay.vrfnw.com')).toBe('public')
    expect(classifyBrowserHostname('invoice.vrfnw.com')).toBe('admin')
    expect(classifyBrowserHostname('localhost')).toBe('dev')
  })
})
