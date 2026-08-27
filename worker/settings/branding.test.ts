import { describe, expect, it } from 'vitest'
import {
  brandingPathAllowedForCompany,
  parseBrandingJson,
  publicBranding,
  safeObjectKey,
  validateUploadBytes,
} from './branding.ts'
import { brandingFileUrl, isSafeObjectKey } from '../../src/branding.ts'
import { DEFAULT_COMPANY_ID } from '../tenancy/types.ts'

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

  it('namespaces uploaded object keys by company', () => {
    const companyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const key = safeObjectKey('invoice-logo', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'png', companyId)
    expect(key).toBe(
      `branding/${companyId}/invoice-logo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`,
    )
    expect(isSafeObjectKey(key)).toBe(true)
    expect(brandingPathAllowedForCompany(brandingFileUrl(key), companyId)).toBe(
      true,
    )
    expect(
      brandingPathAllowedForCompany(brandingFileUrl(key), DEFAULT_COMPANY_ID),
    ).toBe(false)
  })

  it('rejects another tenant branding path when parsing settings', () => {
    const other = brandingFileUrl(
      'branding/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/invoice-logo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
    )
    const parsed = parseBrandingJson(
      JSON.stringify({ invoiceLogo: { path: other } }),
      DEFAULT_COMPANY_ID,
    )
    expect(parsed.invoiceLogo.path).toBe('/branding/bitz-designs-icon.png')
  })

  it('still accepts legacy Bitz Designs object keys', () => {
    expect(
      isSafeObjectKey(
        'branding/invoice-logo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
      ),
    ).toBe(true)
    expect(
      brandingPathAllowedForCompany(
        brandingFileUrl(
          'branding/invoice-logo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
        ),
        DEFAULT_COMPANY_ID,
      ),
    ).toBe(true)
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
