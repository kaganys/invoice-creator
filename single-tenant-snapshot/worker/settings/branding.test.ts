import { describe, expect, it } from 'vitest'
import {
  parseBrandingJson,
  publicBranding,
  validateUploadBytes,
} from './branding.ts'
import { brandingFileUrl } from '../../src/branding.ts'

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
])

describe('branding settings', () => {
  it('falls back to built-in repository assets', () => {
    const publicConfig = publicBranding(parseBrandingJson(null))
    expect(publicConfig.siteWordmark.path).toBe(
      '/branding/bitz-designs-wordmark.png',
    )
    expect(publicConfig.siteIcon.path).toBe('/branding/bitz-designs-icon.png')
    expect(publicConfig.invoiceLogo.path).toBe('/branding/bitz-designs-icon.png')
    expect(publicConfig.invoiceLogo.isDefault).toBe(true)
  })

  it('accepts an uploaded file URL and rejects unknown paths', () => {
    const uploaded = brandingFileUrl(
      'branding/invoice-logo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
    )
    const parsed = parseBrandingJson(
      JSON.stringify({ invoiceLogo: { path: uploaded } }),
    )
    expect(parsed.invoiceLogo.path).toBe(uploaded)
    const ignored = parseBrandingJson(
      JSON.stringify({ invoiceLogo: { path: '/etc/passwd' } }),
    )
    expect(ignored.invoiceLogo.path).toBe('/branding/bitz-designs-icon.png')
  })

  it('rejects SVG and invalid types', () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    )
    expect(validateUploadBytes(svg, 'image/svg+xml').ok).toBe(false)
    expect(validateUploadBytes(PNG, 'image/png').ok).toBe(true)
    expect(validateUploadBytes(PNG, 'image/jpeg').ok).toBe(false)
  })
})
