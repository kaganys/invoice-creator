import { describe, expect, it } from 'vitest'
import { brandingPreviewUrl, smtpFieldsChanged } from './settingsDraft.ts'

const saved = {
  host: 'smtp.example.com',
  port: 587,
  username: 'apikey',
  security: 'starttls' as const,
  fromName: 'Northwind',
  fromEmail: 'billing@northwind.example',
  replyTo: '',
  subjectTemplate: 'Invoice {{invoice_number}}',
  bodyTemplate: '<p>Hello</p>',
}

describe('smtpFieldsChanged', () => {
  it('is clean when the draft matches and the password is blank', () => {
    expect(smtpFieldsChanged(saved, { ...saved }, '   ')).toBe(false)
  })

  it('is dirty when a new password is typed', () => {
    expect(smtpFieldsChanged(saved, { ...saved }, 'secret')).toBe(true)
  })

  it('is dirty when the from address changes', () => {
    expect(
      smtpFieldsChanged(saved, { ...saved, fromEmail: 'ap@northwind.example' }, ''),
    ).toBe(true)
  })
})

describe('brandingPreviewUrl', () => {
  it('prefers a chosen file, then a restore, then the saved image', () => {
    expect(
      brandingPreviewUrl({
        savedUrl: '/api/branding/file/logo.png',
        builtinUrl: '/branding/bitz-designs-icon.png',
        pendingObjectUrl: 'blob:logo',
        restore: true,
      }),
    ).toBe('blob:logo')
    expect(
      brandingPreviewUrl({
        savedUrl: '/api/branding/file/logo.png',
        builtinUrl: '/branding/bitz-designs-icon.png',
        pendingObjectUrl: null,
        restore: true,
      }),
    ).toBe('/branding/bitz-designs-icon.png')
    expect(
      brandingPreviewUrl({
        savedUrl: '/api/branding/file/logo.png',
        builtinUrl: '/branding/bitz-designs-icon.png',
        pendingObjectUrl: null,
        restore: false,
      }),
    ).toBe('/api/branding/file/logo.png')
  })
})
