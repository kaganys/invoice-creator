import { describe, expect, it } from 'vitest'
import { SETTINGS_KEYS } from '../settings/keys.ts'
import type { SequenceStore, SettingsKvStore } from '../settings/types.ts'
import {
  numberingPrefixFromName,
  seedCompanyWorkspace,
  statementDescriptorFromName,
} from './workspace.ts'

function memoryStores() {
  const kv = new Map<string, string | null>()
  const settings: SettingsKvStore = {
    async get(key) {
      return kv.get(key) ?? null
    },
    async set(key, value) {
      kv.set(key, value)
    },
  }
  let next = 0
  const sequences: SequenceStore = {
    async getNextSequence() {
      return next
    },
    async setNextSequence(value) {
      next = value
    },
    async allocateSequence() {
      const allocated = next
      next += 1
      return allocated
    },
  }
  return { kv, settings, sequences }
}

describe('tenant workspace seed', () => {
  it('derives isolated numbering and Stripe descriptor from the company name', () => {
    expect(numberingPrefixFromName('Acme Studio')).toBe('ACMEST')
    expect(statementDescriptorFromName('Acme Studio')).toBe('ACME STUDIO')
  })

  it('writes independent settings rows for a new company', async () => {
    const { kv, settings, sequences } = memoryStores()
    await seedCompanyWorkspace({
      settings,
      sequences,
      company: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Northwind' },
      timestamp: '2026-08-27T00:00:00.000Z',
    })
    expect(await sequences.getNextSequence()).toBe(1)
    expect(kv.has(SETTINGS_KEYS.branding)).toBe(true)
    expect(kv.has(SETTINGS_KEYS.smtp)).toBe(true)
    expect(kv.has(SETTINGS_KEYS.payments)).toBe(true)
    expect(kv.has(SETTINGS_KEYS.numbering)).toBe(true)
    expect(kv.get(SETTINGS_KEYS.defaults)).toContain('"zelleEmail":""')
    expect(kv.get(SETTINGS_KEYS.payments)).toContain('NORTHWIND')
    expect(kv.get(SETTINGS_KEYS.numbering)).toContain('NORTHW')
  })

  it('stores onboard from-address and zelle on the new tenant only', async () => {
    const { kv, settings, sequences } = memoryStores()
    await seedCompanyWorkspace({
      settings,
      sequences,
      company: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Northwind' },
      timestamp: '2026-08-27T00:00:00.000Z',
      extras: {
        fromName: 'Ada',
        fromEmail: 'ada@northwind.test',
        zelleEmail: 'pay@northwind.test',
      },
    })
    expect(kv.get(SETTINGS_KEYS.smtp)).toContain('ada@northwind.test')
    expect(kv.get(SETTINGS_KEYS.defaults)).toContain('pay@northwind.test')
  })
})
