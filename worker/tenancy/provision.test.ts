import { describe, expect, it } from 'vitest'
import { brandingUploadsFromForm } from './provision.ts'
import { allocateCompanySlug, slugifyCompanyName } from './bootstrap.ts'
import type { CompanyRecord, TenantStore } from './types.ts'

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
])

describe('tenant onboarding helpers', () => {
  it('slugifies company names', () => {
    expect(slugifyCompanyName('Acme Studio')).toBe('acme-studio')
  })

  it('allocates a unique slug when the base is taken', async () => {
    const existing: CompanyRecord = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Acme',
      slug: 'acme-studio',
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    }
    const store = {
      async listCompanies() {
        return [existing]
      },
    } as Pick<TenantStore, 'listCompanies'> as TenantStore
    expect(await allocateCompanySlug(store, 'Acme Studio')).toBe(
      'acme-studio-2',
    )
  })

  it('collects optional branding files from onboard form data', async () => {
    const form = new FormData()
    form.set(
      'site-icon',
      new File([PNG], 'icon.png', { type: 'image/png' }),
    )
    form.set('invoice-logo', new File([], 'empty.png', { type: 'image/png' }))
    const uploads = await brandingUploadsFromForm(form)
    expect(uploads.map((item) => item.kind)).toEqual(['site-icon'])
    expect(uploads[0]?.bytes.byteLength).toBe(PNG.byteLength)
  })
})
