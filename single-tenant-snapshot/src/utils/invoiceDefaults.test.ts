import { describe, expect, it } from 'vitest'
import {
  payloadToInvoiceDefaults,
  snapshotNewInvoice,
} from './invoiceDefaults.ts'
import { BUILTIN_INVOICE_LOGO } from '../types/invoice.ts'
import { addDays } from './dates.ts'

const defaultsA = {
  defaultFromId: 'person-1',
  zelleEmail: 'billing@bitzdesigns.co',
  cardFeePercentScaled: 300,
  cardFeeFixedCents: 30,
  currency: 'USD',
  paymentMemo: 'Pay via Zelle',
  dueDays: 30,
  notes: 'Thanks',
  country: '',
}

describe('snapshotNewInvoice', () => {
  it('copies current defaults into a new invoice', () => {
    const invoice = snapshotNewInvoice({
      defaults: defaultsA,
      fromPerson: {
        name: 'Bitz Designs',
        email: 'hello@bitzdesigns.co',
        address: {
          line1: '',
          line2: '',
          city: '',
          region: '',
          postalCode: '',
          country: 'United States',
        },
      },
      number: 'BD2026-0001',
      invoiceLogo: BUILTIN_INVOICE_LOGO,
      now: new Date(2026, 7, 25),
    })
    expect(invoice.payment.cardFeePercent).toBe('3')
    expect(invoice.payment.zelleEmail).toBe('billing@bitzdesigns.co')
    expect(invoice.from.name).toBe('Bitz Designs')
    expect(invoice.from.address.country).toBe('United States')
  })

  it('does not keep a live link to later default changes', () => {
    const invoice = snapshotNewInvoice({
      defaults: defaultsA,
      fromPerson: null,
      number: 'A',
      invoiceLogo: BUILTIN_INVOICE_LOGO,
      now: new Date(2026, 7, 25),
    })
    const later = snapshotNewInvoice({
      defaults: { ...defaultsA, cardFeePercentScaled: 250 },
      fromPerson: null,
      number: 'B',
      invoiceLogo: BUILTIN_INVOICE_LOGO,
      now: new Date(2026, 7, 25),
    })
    expect(invoice.payment.cardFeePercent).toBe('3')
    expect(later.payment.cardFeePercent).toBe('2.5')
  })

  it('calculates due date from issue date plus due days', () => {
    const now = new Date(2026, 7, 25)
    const invoice = snapshotNewInvoice({
      defaults: defaultsA,
      fromPerson: null,
      number: 'A',
      invoiceLogo: BUILTIN_INVOICE_LOGO,
      now,
    })
    expect(invoice.issueDate).toBe('2026-08-25')
    expect(invoice.dueDate).toBe(addDays('2026-08-25', 30))
    expect(invoice.dueDate).toBe('2026-09-24')
  })

  it('fills an empty From country from the default country', () => {
    const invoice = snapshotNewInvoice({
      defaults: { ...defaultsA, country: 'United States' },
      fromPerson: {
        name: 'Bitz Designs',
        email: 'hello@bitzdesigns.co',
        address: {
          line1: '1 Street',
          line2: '',
          city: 'New York',
          region: 'NY',
          postalCode: '10001',
          country: '',
        },
      },
      number: 'A',
      invoiceLogo: BUILTIN_INVOICE_LOGO,
      now: new Date(2026, 7, 25),
    })
    expect(invoice.from.address.country).toBe('United States')
    expect(invoice.customer.address.country).toBe('United States')
  })

  it('uses the built-in memo when the stored memo is empty', () => {
    const mapped = payloadToInvoiceDefaults({
      defaultFromId: null,
      zelleEmail: 'billing@bitzdesigns.co',
      cardFeePercent: '',
      cardFeeFixed: '',
      currency: 'USD',
      paymentMemo: '   ',
      dueDays: 30,
      notes: '',
      country: '',
    })
    expect(mapped.paymentMemo).toContain('Looking forward to continued work together')
  })

  it('maps settings payload strings into a snapshot', () => {
    const mapped = payloadToInvoiceDefaults({
      defaultFromId: 'person-1',
      zelleEmail: 'billing@bitzdesigns.co',
      cardFeePercent: '3',
      cardFeeFixed: '0.30',
      currency: 'USD',
      paymentMemo: 'Memo',
      dueDays: 30,
      notes: 'Notes',
      country: 'United States',
    })
    const invoice = snapshotNewInvoice({
      defaults: mapped,
      fromPerson: null,
      number: 'A',
      invoiceLogo: BUILTIN_INVOICE_LOGO,
      now: new Date(2026, 7, 25),
    })
    expect(invoice.payment.cardFeePercent).toBe('3')
    expect(invoice.payment.cardFeeFixed).toBe('0.30')
    expect(invoice.payment.memo).toBe('Memo')
    expect(invoice.notes).toBe('Notes')
    expect(invoice.dueDate).toBe('2026-09-24')
    expect(invoice.customer.address.country).toBe('United States')
  })

  it('ignores a deleted default From person', () => {
    const invoice = snapshotNewInvoice({
      defaults: defaultsA,
      fromPerson: null,
      number: 'A',
      invoiceLogo: BUILTIN_INVOICE_LOGO,
      now: new Date(2026, 7, 25),
    })
    expect(invoice.from.name).toBe('')
    expect(invoice.from.email).toBe('')
  })
})
