export type PaymentTokenStatus = 'active' | 'revoked'

export type PaymentRevokeReason = 'paid' | 'void' | 'regenerated' | 'manual' | 'mismatch'

export type PaymentTokenRecord = {
  id: string
  invoiceId: string
  tokenHash: string
  encryptedToken: string
  createdAt: string
  revokedAt: string | null
  revokedReason: string | null
  status: PaymentTokenStatus
}

export interface PaymentTokenStore {
  getActiveByInvoiceId(invoiceId: string): Promise<PaymentTokenRecord | null>
  getByHash(tokenHash: string): Promise<PaymentTokenRecord | null>
  insert(record: PaymentTokenRecord): Promise<void>
  revokeActive(
    invoiceId: string,
    reason: PaymentRevokeReason,
    revokedAt: string,
  ): Promise<number>
}

export type PublicInvoiceState = 'payable' | 'paid' | 'void' | 'invalid' | 'processing'

export type PublicInvoiceLine = {
  description: string
  quantity: string
  unitPrice: string
  amount: string
}

export type PublicInvoicePayload = {
  number: string
  customerName: string
  businessName: string
  issueDate: string
  dueDate: string
  currency: string
  lineItems: PublicInvoiceLine[]
  amountDue: string
  amountDueCents: number
  cardFeeCents: number
  cardTotalCents: number
  cardFee: string
  cardTotal: string
  cardPaymentAvailable: boolean
  achPaymentAvailable: boolean
  paymentMethodTypes: string[]
  stripePublishableKey: string | null
  logoPath: string
  pendingKind: 'ach' | 'card' | null
}
