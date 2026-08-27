import {
  BUILTIN_INVOICE_LOGO,
  type Invoice,
  type InvoiceLogoSnapshot,
  type InvoiceParty,
} from '../types/invoice.ts'
import {
  createEmptyLineItem,
  DEFAULT_PAYMENT_MEMO,
  DEFAULT_ZELLE_EMAIL,
} from '../data/defaultInvoice.ts'
import { emptyAddress } from './address.ts'
import { addDays, toIsoDate } from './dates.ts'
import {
  centsToInputString,
  parseMoneyToCents,
  parsePercentScaled,
  scaledToInputString,
} from './money.ts'

export { DEFAULT_PAYMENT_MEMO, DEFAULT_ZELLE_EMAIL }

export const DEFAULT_CURRENCY = 'USD'
export const DEFAULT_DUE_DAYS = 30

export type InvoiceDefaults = {
  defaultFromId: string | null
  zelleEmail: string
  cardFeePercentScaled: number
  cardFeeFixedCents: number
  currency: string
  paymentMemo: string
  dueDays: number
  notes: string
  country: string
}

export const BUILTIN_INVOICE_DEFAULTS: InvoiceDefaults = {
  defaultFromId: null,
  zelleEmail: DEFAULT_ZELLE_EMAIL,
  cardFeePercentScaled: 0,
  cardFeeFixedCents: 0,
  currency: DEFAULT_CURRENCY,
  paymentMemo: DEFAULT_PAYMENT_MEMO,
  dueDays: DEFAULT_DUE_DAYS,
  notes: '',
  country: '',
}

export { BUILTIN_INVOICE_LOGO }

export type InvoiceDefaultsPayloadLike = {
  defaultFromId: string | null
  zelleEmail: string
  cardFeePercent: string
  cardFeeFixed: string
  currency: string
  paymentMemo: string
  dueDays: number
  notes: string
  country: string
}

export function payloadToInvoiceDefaults(
  payload: InvoiceDefaultsPayloadLike,
): InvoiceDefaults {
  const percent = parsePercentScaled(
    typeof payload.cardFeePercent === 'string' ? payload.cardFeePercent : '',
  )
  const fixedRaw =
    typeof payload.cardFeeFixed === 'string' ? payload.cardFeeFixed.trim() : ''
  const fixed = fixedRaw === '' ? 0 : parseMoneyToCents(fixedRaw)
  const dueDays = payload.dueDays
  return {
    defaultFromId: payload.defaultFromId,
    zelleEmail: payload.zelleEmail.trim() || DEFAULT_ZELLE_EMAIL,
    cardFeePercentScaled: percent === null || percent < 0 ? 0 : percent,
    cardFeeFixedCents: fixed === null || fixed < 0 ? 0 : fixed,
    currency: payload.currency.trim() || DEFAULT_CURRENCY,
    paymentMemo:
      typeof payload.paymentMemo === 'string' && payload.paymentMemo.trim()
        ? payload.paymentMemo
        : DEFAULT_PAYMENT_MEMO,
    dueDays:
      typeof dueDays === 'number' && Number.isInteger(dueDays) && dueDays >= 0
        ? dueDays
        : DEFAULT_DUE_DAYS,
    notes: typeof payload.notes === 'string' ? payload.notes : '',
    country: typeof payload.country === 'string' ? payload.country.trim() : '',
  }
}

export function percentScaledToInput(scaled: number): string {
  if (scaled === 0) {
    return ''
  }
  return scaledToInputString(scaled, 2)
}

export function centsToFeeInput(cents: number): string {
  if (cents === 0) {
    return ''
  }
  return centsToInputString(cents)
}

export function partyFromDefaults(
  fromPerson: InvoiceParty | null,
  defaultCountry: string,
): InvoiceParty {
  if (fromPerson) {
    return {
      name: fromPerson.name,
      email: fromPerson.email,
      address: {
        ...fromPerson.address,
        country: fromPerson.address.country.trim() || defaultCountry,
      },
    }
  }
  return {
    name: '',
    email: '',
    address: {
      ...emptyAddress(),
      country: defaultCountry,
    },
  }
}

/**
 * Copy current defaults into a brand-new invoice. The result is a snapshot:
 * later Settings changes must not mutate this object.
 */
export function snapshotNewInvoice(options: {
  defaults: InvoiceDefaults
  fromPerson: InvoiceParty | null
  number: string
  invoiceLogo: InvoiceLogoSnapshot
  now?: Date
}): Invoice {
  const now = options.now ?? new Date()
  const issueDate = toIsoDate(now)
  const dueDays = options.defaults.dueDays
  const dueDate = dueDays > 0 ? addDays(issueDate, dueDays) : ''
  const country = options.defaults.country
  const from = partyFromDefaults(options.fromPerson, country)

  return {
    number: options.number,
    issueDate,
    dueDate,
    currency: options.defaults.currency || DEFAULT_CURRENCY,
    from,
    customer: {
      name: '',
      email: '',
      address: {
        ...emptyAddress(),
        country,
      },
    },
    lineItems: [createEmptyLineItem()],
    payment: {
      memo: options.defaults.paymentMemo,
      zelleEmail: options.defaults.zelleEmail,
      cardFeePercent: percentScaledToInput(options.defaults.cardFeePercentScaled),
      cardFeeFixed: centsToFeeInput(options.defaults.cardFeeFixedCents),
    },
    notes: options.defaults.notes,
    invoiceLogo: { ...options.invoiceLogo },
  }
}
