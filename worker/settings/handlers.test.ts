import { describe, expect, it } from 'vitest'
import type { InvoiceStore } from '../invoices/types.ts'
import type { DirectoryStore, PersonRecord } from '../people/types.ts'
import {
  allocateInvoiceNumber,
  changeNextSequence,
  getAllSettings,
  getBrandingSettings,
  getSmtpSettings,
  restoreBrandingAsset,
  testSmtpSettings,
  updateDefaults,
  updateFormatSettings,
  updateSmtpSettings,
  uploadBrandingAsset,
  type SettingsDeps,
} from './handlers.ts'
import type { ObjectStore, SequenceStore, SettingsKvStore } from './types.ts'
import { MAX_BRANDING_BYTES } from './branding.ts'

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
])

const PERSON_ID = '11111111-1111-4111-8111-111111111111'
const NOW = '2026-08-25T12:00:00.000Z'

function jsonRequest(body: unknown, method = 'PUT'): Request {
  return new Request('https://example.test/api/settings', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createDeps(overrides: Partial<SettingsDeps> = {}): SettingsDeps {
  const kv = new Map<string, string | null>()
  let nextSequence = 1
  const numbers = new Set<string>()
  const people = new Map<string, PersonRecord>()
  const objects = new Map<string, { body: ArrayBuffer; contentType: string }>()
  const objectStore: ObjectStore = {
    async put(key, data, contentType) {
      const body = data instanceof Uint8Array ? data.slice().buffer : data
      objects.set(key, { body, contentType })
    },
    async get(key) {
      return objects.get(key) ?? null
    },
  }

  const settings: SettingsKvStore = {
    async get(key) {
      return kv.has(key) ? (kv.get(key) ?? null) : null
    },
    async set(key, value) {
      kv.set(key, value)
    },
  }

  const sequences: SequenceStore = {
    async getNextSequence() {
      return nextSequence
    },
    async setNextSequence(next) {
      nextSequence = next
    },
    async allocateSequence() {
      const allocated = nextSequence
      nextSequence += 1
      return allocated
    },
  }

  const invoices: Pick<InvoiceStore, 'findIdByNumber'> = {
    async findIdByNumber(number) {
      return numbers.has(number) ? 'exists' : null
    },
  }

  const directory: Pick<DirectoryStore, 'getPerson'> = {
    async getPerson(id) {
      return people.get(id) ?? null
    },
  }

  people.set(PERSON_ID, {
    id: PERSON_ID,
    name: 'Bitz Designs',
    email: 'hello@bitzdesigns.co',
    address: {
      line1: '',
      line2: '',
      city: '',
      region: '',
      postalCode: '',
      country: '',
    },
    createdAt: NOW,
    updatedAt: NOW,
  })

  return {
    settings,
    sequences,
    people: directory,
    invoices,
    objects: objectStore,
    smtpPassword: undefined,
    clock: () => NOW,
    now: () => new Date('2026-08-25T12:00:00.000Z'),
    idFactory: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ...overrides,
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe('settings handlers', () => {
  it('returns built-in defaults without touching remote storage semantics', async () => {
    const response = await getAllSettings(createDeps())
    const payload = await readJson(response)
    const defaults = payload.defaults as { zelleEmail: string; dueDays: number }
    expect(defaults.zelleEmail).toBe('billing@bitzdesigns.co')
    expect(defaults.dueDays).toBe(30)
    const numbering = payload.numbering as { example: string }
    expect(numbering.example).toBe('BD2026-0001')
  })

  it('allocates unique sequences for concurrent-style repeated calls', async () => {
    const deps = createDeps()
    const first = await allocateInvoiceNumber(deps)
    const second = await allocateInvoiceNumber(deps)
    const a = (await readJson(first)) as { number: string; sequence: number }
    const b = (await readJson(second)) as { number: string; sequence: number }
    expect(a.sequence).toBe(1)
    expect(b.sequence).toBe(2)
    expect(a.number).toBe('BD2026-0001')
    expect(b.number).toBe('BD2026-0002')
    expect(a.number).not.toBe(b.number)
  })

  it('skips a sequence when that formatted number already exists', async () => {
    const numbers = new Set(['BD2026-0001'])
    const deps = createDeps({
      invoices: {
        async findIdByNumber(number) {
          return numbers.has(number) ? 'exists' : null
        },
      },
    })
    const response = await allocateInvoiceNumber(deps)
    const payload = await readJson(response)
    expect(payload.number).toBe('BD2026-0002')
  })

  it('rejects an invalid next sequence and a colliding next number', async () => {
    const zero = await changeNextSequence(
      jsonRequest({ nextSequence: 0 }, 'POST'),
      createDeps(),
    )
    expect(zero.status).toBe(400)

    const deps = createDeps({
      invoices: {
        async findIdByNumber(number) {
          return number === 'BD2026-0051' ? 'exists' : null
        },
      },
    })
    const conflict = await changeNextSequence(
      jsonRequest({ nextSequence: 51 }, 'POST'),
      deps,
    )
    expect(conflict.status).toBe(409)
  })

  it('clears a deleted default From on read', async () => {
    const deps = createDeps()
    await deps.settings.set(
      'default_from_person_id',
      '99999999-9999-4999-8999-999999999999',
      NOW,
    )
    const response = await getAllSettings(deps)
    const payload = await readJson(response)
    expect(payload.defaultFromId).toBeNull()
  })

  it('stores a valid default From', async () => {
    const deps = createDeps()
    const response = await updateDefaults(
      jsonRequest({
        defaultFromId: PERSON_ID,
        zelleEmail: 'billing@bitzdesigns.co',
        cardFeePercent: '2.5',
        cardFeeFixed: '',
        currency: 'USD',
        paymentMemo: 'Memo',
        dueDays: 14,
        notes: '',
        country: '',
      }),
      deps,
    )
    expect(response.status).toBe(200)
    const payload = await readJson(response)
    const defaults = payload.defaults as { cardFeePercent: string; dueDays: number }
    expect(payload.defaultFromId).toBe(PERSON_ID)
    expect(defaults.cardFeePercent).toBe('2.5')
    expect(defaults.dueDays).toBe(14)
  })
})

describe('branding handlers', () => {
  it('returns built-in branding paths by default', async () => {
    const response = await getBrandingSettings(createDeps())
    const payload = await readJson(response)
    const branding = payload.branding as {
      invoiceLogo: { path: string; url: string; isDefault: boolean }
      siteWordmark: { path: string }
    }
    expect(branding.invoiceLogo.path).toBe('/branding/bitz-designs-icon.png')
    expect(branding.invoiceLogo.isDefault).toBe(true)
    expect(branding.siteWordmark.path).toBe(
      '/branding/bitz-designs-wordmark.png',
    )
  })

  it('uploads a replacement and can restore the built-in default', async () => {
    const deps = createDeps()
    const form = new FormData()
    form.append('file', new File([PNG], 'ignored.jpg', { type: 'image/png' }))
    const uploaded = await uploadBrandingAsset(
      new Request('https://example.test/api/settings/branding/invoice-logo', {
        method: 'POST',
        body: form,
      }),
      'invoice-logo',
      deps,
    )
    expect(uploaded.status).toBe(200)
    const afterUpload = await readJson(uploaded)
    const branding = afterUpload.branding as {
      invoiceLogo: { isDefault: boolean; path: string }
    }
    expect(branding.invoiceLogo.isDefault).toBe(false)
    expect(branding.invoiceLogo.path).toContain('/api/branding/file/')

    const restored = await restoreBrandingAsset('invoice-logo', deps)
    const afterRestore = await readJson(restored)
    const restoredBranding = afterRestore.branding as {
      invoiceLogo: { isDefault: boolean; path: string }
    }
    expect(restoredBranding.invoiceLogo.isDefault).toBe(true)
    expect(restoredBranding.invoiceLogo.path).toBe(
      '/branding/bitz-designs-icon.png',
    )
  })

  it('rejects an oversized branding upload', async () => {
    const huge = new Uint8Array(MAX_BRANDING_BYTES + 1)
    huge.set(PNG, 0)
    const form = new FormData()
    form.append('file', new File([huge], 'big.png', { type: 'image/png' }))
    const response = await uploadBrandingAsset(
      new Request('https://example.test/upload', { method: 'POST', body: form }),
      'site-icon',
      createDeps(),
    )
    expect(response.status).toBe(400)
  })
})

describe('SMTP handlers', () => {
  it('never returns the SMTP password', async () => {
    const deps = createDeps({ smtpPassword: 'real-secret-value' })
    const response = await getSmtpSettings(deps)
    const payload = await readJson(response)
    const body = JSON.stringify(payload)
    expect(body).not.toContain('real-secret-value')
    const smtp = payload.smtp as { passwordConfigured: boolean }
    expect(smtp.passwordConfigured).toBe(true)
    expect(smtp).not.toHaveProperty('password')
  })

  it('sends a real SMTP test through the injected transport', async () => {
    let sentTo = ''
    const deps = createDeps({
      smtpPassword: 'secret',
      mailFactory: () => ({
        async send(message) {
          sentTo = message.to
          expect(JSON.stringify(message)).not.toContain('secret')
          return {}
        },
      }),
    })
    await updateSmtpSettings(
      jsonRequest({
        host: 'smtp.example.com',
        port: 587,
        username: 'user',
        security: 'starttls',
        fromName: 'Bitz',
        fromEmail: 'billing@bitzdesigns.co',
        replyTo: '',
      }),
      deps,
    )
    const tested = await testSmtpSettings(
      jsonRequest({ to: 'admin@example.com' }, 'POST'),
      deps,
    )
    expect(tested.status).toBe(200)
    expect(sentTo).toBe('admin@example.com')
    const payload = await readJson(tested)
    expect(payload.delivered).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('secret')
  })

  it('does not fake success when SMTP delivery fails', async () => {
    const deps = createDeps({
      smtpPassword: 'secret',
      mailFactory: () => ({
        async send() {
          throw new Error('connection refused')
        },
      }),
    })
    await updateSmtpSettings(
      jsonRequest({
        host: 'smtp.example.com',
        port: 587,
        username: 'user',
        security: 'starttls',
        fromName: 'Bitz',
        fromEmail: 'billing@bitzdesigns.co',
        replyTo: '',
      }),
      deps,
    )
    const tested = await testSmtpSettings(
      jsonRequest({ to: 'admin@example.com' }, 'POST'),
      deps,
    )
    expect(tested.status).toBe(502)
    const payload = await readJson(tested)
    expect(String(payload.error)).toMatch(/connection refused/)
    expect(payload.delivered).not.toBe(true)
  })

  it('rejects a test without the SMTP password', async () => {
    const deps = createDeps()
    await updateSmtpSettings(
      jsonRequest({
        host: 'smtp.example.com',
        port: 587,
        fromEmail: 'billing@bitzdesigns.co',
      }),
      deps,
    )
    const tested = await testSmtpSettings(
      jsonRequest({ to: 'admin@example.com' }, 'POST'),
      deps,
    )
    expect(tested.status).toBe(400)
  })
})

describe('format handlers', () => {
  it('returns default invoice format', async () => {
    const response = await getAllSettings(createDeps())
    const payload = await readJson(response)
    const format = payload.format as { global: { primaryFont: string } }
    expect(format.global.primaryFont).toBe('inter')
  })

  it('rejects invalid format colors', async () => {
    const response = await updateFormatSettings(
      jsonRequest({ global: { primaryColor: 'blue' } }),
      createDeps(),
    )
    expect(response.status).toBe(400)
  })
})
