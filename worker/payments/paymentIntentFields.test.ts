import { describe, expect, it } from 'vitest'
import { generatePaymentToken } from './tokenCrypto.ts'
import {
  STRIPE_METADATA_MAX_KEYS,
  STRIPE_METADATA_VALUE_MAX,
  buildPaymentIntentDetails,
  paymentIntentDescription,
  paymentIntentReceiptEmail,
  type PaymentIntentDetailsInput,
} from './paymentIntentFields.ts'

const base: PaymentIntentDetailsInput = {
  invoiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  invoiceNumber: 'BD2026-0051',
  issueDate: '2026-08-25',
  dueDate: '2026-09-24',
  currency: 'USD',
  invoiceAmountCents: 5000,
  totalCents: 5180,
  companyId: 'company-1',
  companyName: 'Northwind Studio',
  paymentCategory: 'card',
  notes: 'Thank you.',
  paymentMemo: 'Pay by card.',
  customer: {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    address: {
      line1: '1 Main St',
      line2: '',
      city: 'New York',
      region: 'NY',
      postalCode: '10001',
      country: 'US',
    },
  },
  from: {
    name: 'Bitz Designs',
    email: 'billing@bitzdesigns.co',
    address: {
      line1: '9 Studio Way',
      line2: '',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      country: 'United States',
    },
  },
  lineItems: [
    { description: 'Design', quantityScaled: 10_000, unitPriceCents: 5000 },
  ],
}

describe('payment intent dashboard fields', () => {
  it('names the invoice and the business on the Stripe description', () => {
    expect(paymentIntentDescription('BD2026-0051', 'Bitz Designs')).toBe(
      'Invoice BD2026-0051 · Bitz Designs',
    )
    expect(buildPaymentIntentDetails(base).description).toBe(
      'Invoice BD2026-0051 · Bitz Designs',
    )
  })

  it('leaves the business off when the invoice has no name', () => {
    expect(paymentIntentDescription('BD2026-0051', '  ')).toBe('Invoice BD2026-0051')
  })

  it('uses the customer email for the receipt only when one is known', () => {
    expect(paymentIntentReceiptEmail('ada@example.com')).toBe('ada@example.com')
    expect(paymentIntentReceiptEmail('  ada@example.com  ')).toBe('ada@example.com')
    expect(paymentIntentReceiptEmail('')).toBeUndefined()
    expect(paymentIntentReceiptEmail('not-an-email')).toBeUndefined()
  })

  it('copies invoice, customer, and People fields as flat metadata', () => {
    const details = buildPaymentIntentDetails({
      ...base,
      person: {
        name: 'Directory Name',
        company: 'Ada LLC',
        email: 'directory@example.com',
        phone: '555-0100',
        taxId: '12-3456789',
        address: {
          line1: 'Person street',
          line2: 'Suite 4',
          city: '',
          region: '',
          postalCode: '',
          country: '',
        },
        customFields: {
          'Account number': 'A-9',
          'PO reference': 'PO-44',
        },
      },
    })

    expect(details.metadata).toMatchObject({
      invoice_id: base.invoiceId,
      invoice_number: 'BD2026-0051',
      issue_date: '2026-08-25',
      due_date: '2026-09-24',
      invoice_amount: '50.00',
      total: '51.80',
      currency: 'USD',
      company_id: 'company-1',
      company_name: 'Northwind Studio',
      customer_name: 'Ada Lovelace',
      customer_company: 'Ada LLC',
      customer_email: 'ada@example.com',
      customer_phone: '555-0100',
      customer_tax_id: '12-3456789',
      billing_address_line1: '1 Main St',
      billing_address_line2: 'Suite 4',
      billing_address_city: 'New York',
      billing_address_region: 'NY',
      billing_address_postal_code: '10001',
      billing_address_country: 'US',
      from_name: 'Bitz Designs',
      from_email: 'billing@bitzdesigns.co',
      from_address_line1: '9 Studio Way',
      from_address_city: 'Brooklyn',
      line_items: 'Design × 1 @ 50.00 = 50.00',
      invoice_notes: 'Thank you.',
      payment_memo: 'Pay by card.',
      customer_account_number: 'A-9',
      customer_po_reference: 'PO-44',
    })
    expect(details.metadata.billing_address_line2).toBe('Suite 4')
    expect(details.metadata).not.toHaveProperty('from_address_line2')
    expect(details.receiptEmail).toBe('ada@example.com')
    expect(details.shipping).toEqual({
      name: 'Ada Lovelace',
      phone: '555-0100',
      address: {
        line1: '1 Main St',
        line2: 'Suite 4',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
    })
    expect(JSON.stringify(details.metadata)).not.toContain('Directory Name')
    expect(JSON.stringify(details.metadata)).not.toContain('Person street')
  })

  it('skips empty values, secrets, and payment-link tokens', () => {
    const token = generatePaymentToken()
    const details = buildPaymentIntentDetails({
      ...base,
      notes: `See https://pay.vrfnw.com/i/${token} and sk_test_51secret`,
      customer: {
        name: 'Ada',
        email: '',
        address: { line1: '', line2: '', city: '', region: '', postalCode: '', country: '' },
      },
      person: {
        customFields: {
          payment_token: token,
          api_secret: 'rk_live_51restricted',
          reference: `ref ${token}`,
        },
      },
    })

    expect(details.metadata.invoice_notes).toBe('See [redacted] and [redacted]')
    expect(details.metadata).not.toHaveProperty('customer_payment_token')
    expect(details.metadata).not.toHaveProperty('customer_api_secret')
    expect(details.metadata.customer_reference).toBe('ref [redacted]')
    expect(JSON.stringify(details)).not.toContain(token)
    expect(JSON.stringify(details)).not.toContain('sk_test_51secret')
    expect(JSON.stringify(details)).not.toContain('rk_live_51restricted')
    expect(details.metadata).not.toHaveProperty('billing_address_line1')
    expect(details.receiptEmail).toBeUndefined()
    expect(details.shipping?.address?.country).toBeUndefined()
  })

  it('truncates values and stops at Stripe metadata limits', () => {
    const customFields: Record<string, string> = {}
    for (let index = 0; index < 40; index += 1) {
      customFields[`field ${index} ${'x'.repeat(80)}`] = 'y'.repeat(800)
    }
    const details = buildPaymentIntentDetails({
      ...base,
      notes: 'n'.repeat(800),
      person: { customFields },
    })
    const keys = Object.keys(details.metadata)
    expect(keys.length).toBe(STRIPE_METADATA_MAX_KEYS)
    expect(details.metadata.invoice_id).toBe(base.invoiceId)
    expect(keys.every((key) => key.length <= 40)).toBe(true)
    expect(
      Object.values(details.metadata).every(
        (value) => [...value].length <= STRIPE_METADATA_VALUE_MAX,
      ),
    ).toBe(true)
    expect(details.metadata.invoice_notes?.endsWith('…')).toBe(true)
    expect([...details.metadata.invoice_notes!].length).toBe(STRIPE_METADATA_VALUE_MAX)
  })

  it('omits a non-ISO country from shipping and keeps the rest of the address', () => {
    const details = buildPaymentIntentDetails({
      ...base,
      customer: {
        ...base.customer,
        address: { ...base.customer.address, country: 'United States' },
      },
    })
    expect(details.metadata.billing_address_country).toBe('United States')
    expect(details.shipping?.address?.line1).toBe('1 Main St')
    expect(details.shipping?.address?.country).toBeUndefined()
  })
})
