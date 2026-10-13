import { describe, expect, it } from 'vitest'
import { publicSmtp, validateSmtpWrite } from './smtp.ts'

describe('validateSmtpWrite', () => {
  it('accepts a provider-independent SMTP configuration', () => {
    const result = validateSmtpWrite({
      host: 'smtp.example.com',
      port: 587,
      username: 'apikey',
      security: 'starttls',
      fromName: 'Bitz Designs',
      fromEmail: 'billing@bitzdesigns.co',
      replyTo: 'hello@bitzdesigns.co',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects port 25', () => {
    const result = validateSmtpWrite({
      host: 'smtp.example.com',
      port: 25,
      security: 'none',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/port 25/i)
    }
  })

  it('rejects an invalid From email', () => {
    const result = validateSmtpWrite({
      host: 'smtp.example.com',
      port: 587,
      fromEmail: 'nope',
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a password field so the API cannot accept a secret', () => {
    const result = validateSmtpWrite({
      host: 'smtp.example.com',
      port: 587,
      password: 'super-secret',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/password/i)
      expect(result.message).not.toMatch(/super-secret/)
    }
  })
})

describe('publicSmtp', () => {
  it('never includes a password property', () => {
    const payload = publicSmtp(
      {
        host: 'smtp.example.com',
        port: 587,
        username: 'user',
        security: 'ssl',
        fromName: 'Bitz',
        fromEmail: 'a@b.co',
        replyTo: '',
        subjectTemplate: 'Invoice {{invoice_number}} from {{business_name}}',
        bodyTemplate: 'Hello',
      },
      true,
    )
    expect(payload.passwordConfigured).toBe(true)
    expect(payload).not.toHaveProperty('password')
    expect(JSON.stringify(payload)).not.toMatch(/"password"\s*:/)
  })
})
