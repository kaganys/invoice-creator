import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  confirmPublicPayment,
  createPublicPaymentIntent,
  fetchPublicInvoice,
  type PublicInvoice,
  type PublicPaymentSession,
} from '../../api/publicInvoice.ts'
import {
  displayQuote,
  type PaymentCategory,
} from '../../payments/surcharge.ts'
import { formatMoney } from '../../utils/money.ts'

const stripeCache = new Map<string, Promise<Stripe | null>>()

function stripePromise(publishableKey: string) {
  let pending = stripeCache.get(publishableKey)
  if (!pending) {
    pending = loadStripe(publishableKey)
    stripeCache.set(publishableKey, pending)
  }
  return pending
}

function CheckoutForm({
  token,
  invoice,
  fallbackCategory,
  onBusy,
  onSubmitted,
  onProcessing,
}: {
  token: string
  invoice: PublicInvoice
  fallbackCategory: PaymentCategory
  onBusy: (busy: boolean) => void
  onSubmitted: () => void
  onProcessing: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [elementReady, setElementReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const quote = displayQuote(
    invoice.amountDueCents,
    invoice.cardFeeCents,
    selectedType,
    fallbackCategory,
  )
  const amountLabel = `${formatMoney(quote.totalCents, invoice.currency)} ${invoice.currency}`

  useEffect(() => {
    if (!elements) {
      return
    }
    void elements.update({ amount: quote.totalCents })
  }, [elements, quote.totalCents])

  async function onPay(event: FormEvent) {
    event.preventDefault()
    if (!stripe || !elements || submitting || !elementReady) {
      return
    }
    setSubmitting(true)
    onBusy(true)
    setError(null)
    try {
      const submitted = await elements.submit()
      if (submitted.error) {
        setError(submitted.error.message || 'Check your payment details and try again.')
        return
      }

      const confirmation = await stripe.createConfirmationToken({
        elements,
        params: {
          return_url: window.location.href,
        },
      })
      if (confirmation.error || !confirmation.confirmationToken) {
        setError(
          confirmation.error?.message || 'Could not prepare this payment.',
        )
        return
      }

      const result = await confirmPublicPayment(
        token,
        confirmation.confirmationToken.id,
        window.location.href,
      )

      if (result.status === 'requires_action' && result.clientSecret) {
        const next = await stripe.handleNextAction({
          clientSecret: result.clientSecret,
        })
        if (next.error) {
          setError(next.error.message || 'Authentication was not completed.')
          return
        }
      }

      if (result.status === 'processing' || result.category === 'ach') {
        onProcessing()
        return
      }
      onSubmitted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment failed.')
    } finally {
      setSubmitting(false)
      onBusy(false)
    }
  }

  const canPay = Boolean(stripe && elements && elementReady && !submitting)

  return (
    <form className="public-pay__stripe" onSubmit={(event) => void onPay(event)}>
      <ChargeSummary
        invoice={invoice}
        surchargeCents={quote.surchargeCents}
        totalCents={quote.totalCents}
        category={quote.category}
      />
      <PaymentElement
        onReady={() => {
          setElementReady(true)
        }}
        onChange={(event) => {
          setSelectedType(event.value.type || null)
        }}
        options={{
          layout: 'tabs',
          wallets: {
            applePay: 'auto',
            googlePay: 'auto',
          },
        }}
      />
      {error ? <p className="public-pay__error">{error}</p> : null}
      {!elementReady ? (
        <p className="public-pay__card-note">Loading secure payment form…</p>
      ) : null}
      <button
        type="submit"
        className="btn btn--primary public-pay__pay"
        disabled={!canPay}
      >
        {submitting ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
    </form>
  )
}

export function CardCheckout({
  token,
  invoice,
  onAuthoritativePaid,
}: {
  token: string
  invoice: PublicInvoice
  onAuthoritativePaid?: () => void
}) {
  const [session, setSession] = useState<PublicPaymentSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [delayed, setDelayed] = useState(false)
  const [paid, setPaid] = useState(false)
  const onPaidRef = useRef(onAuthoritativePaid)
  onPaidRef.current = onAuthoritativePaid
  const publishableKey = invoice.stripePublishableKey
  const waiting = confirming || processing

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('redirect_status') === 'succeeded') {
      setConfirming(true)
    }
    if (params.get('redirect_status') === 'pending') {
      setProcessing(true)
    }
  }, [])

  useEffect(() => {
    if (!waiting || paid) {
      return
    }
    let cancelled = false
    let attempts = 0
    let timer: number | undefined

    const poll = async () => {
      try {
        const result = await fetchPublicInvoice(token)
        if (cancelled) {
          return
        }
        if (result.state === 'paid') {
          setPaid(true)
          setConfirming(false)
          setProcessing(false)
          setDelayed(false)
          onPaidRef.current?.()
          return
        }
        if (result.state === 'processing') {
          setProcessing(true)
          setConfirming(false)
        }
        if (result.state === 'payable' && processing) {
          setProcessing(false)
          setConfirming(false)
          setError('Bank payment failed. You can try again.')
          return
        }
      } catch {
        // Keep polling — Access/network blips must not strand a successful charge.
      }
      if (cancelled) {
        return
      }
      attempts += 1
      if (attempts === 8) {
        setDelayed(true)
      }
      const waitMs = attempts < 40 ? 1500 : 5000
      timer = window.setTimeout(() => {
        void poll()
      }, waitMs)
    }

    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) {
        window.clearTimeout(timer)
      }
    }
  }, [waiting, paid, token, processing])

  useEffect(() => {
    if (waiting || paid) {
      return
    }
    let cancelled = false
    setError(null)
    createPublicPaymentIntent(token)
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result.status === 'processing') {
          setProcessing(true)
          return
        }
        if (result.status === 'requires_action' && result.clientSecret) {
          setSession(result)
          setConfirming(true)
          return
        }
        setSession(result)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not start payment.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, waiting, paid])

  const stripe = useMemo(
    () => (publishableKey ? stripePromise(publishableKey) : null),
    [publishableKey],
  )

  const types = session?.paymentMethodTypes ?? invoice.paymentMethodTypes
  const paymentAvailable =
    Boolean(publishableKey) &&
    types.length > 0 &&
    (invoice.cardPaymentAvailable || invoice.achPaymentAvailable)
  const fallbackCategory: PaymentCategory = invoice.cardPaymentAvailable
    ? 'card'
    : 'ach'

  useEffect(() => {
    if (!confirming || !session?.clientSecret || !stripe) {
      return
    }
    let cancelled = false
    void stripe.then(async (loaded) => {
      if (!loaded || cancelled || !session.clientSecret) {
        return
      }
      const next = await loaded.handleNextAction({
        clientSecret: session.clientSecret,
      })
      if (cancelled) {
        return
      }
      if (next.error) {
        setConfirming(false)
        setError(next.error.message || 'Authentication was not completed.')
      }
    })
    return () => {
      cancelled = true
    }
  }, [confirming, session, stripe])

  if (!paymentAvailable) {
    return (
      <p className="public-pay__card-note">
        Online payment is not available for this invoice.
      </p>
    )
  }

  if (paid) {
    return (
      <div>
        <h2 className="public-pay__success">Invoice already paid</h2>
        <p>No further payment is required.</p>
      </div>
    )
  }
  if (processing) {
    return (
      <div>
        <h2 className="public-pay__success">Bank payment submitted</h2>
        <p>Processing</p>
        <p className="public-pay__card-note">
          {delayed
            ? 'Bank payments can take a few business days. You can refresh this page later — it will show as paid when the transfer completes.'
            : 'Your bank payment was submitted. This invoice is not marked paid until the transfer completes.'}
        </p>
        {delayed ? (
          <button
            type="button"
            className="btn btn--primary public-pay__pay"
            onClick={() => {
              window.location.reload()
            }}
          >
            Refresh status
          </button>
        ) : null}
      </div>
    )
  }
  if (confirming) {
    return (
      <div>
        <p className="public-pay__success">
          Payment received. Confirming payment…
        </p>
        <p className="public-pay__card-note">
          {delayed
            ? 'Your payment was submitted. We are waiting for final confirmation. You can refresh this page — if payment completed, it will show as already paid.'
            : 'This usually takes a few seconds.'}
        </p>
        {delayed ? (
          <button
            type="button"
            className="btn btn--primary public-pay__pay"
            onClick={() => {
              window.location.reload()
            }}
          >
            Refresh status
          </button>
        ) : null}
      </div>
    )
  }
  if (error) {
    return <p className="public-pay__error">{error}</p>
  }
  if (!session || !stripe || session.mode !== 'payment') {
    return (
      <div>
        <ChargeSummary
          invoice={invoice}
          surchargeCents={
            invoice.cardPaymentAvailable ? invoice.cardFeeCents : 0
          }
          totalCents={
            invoice.cardPaymentAvailable
              ? invoice.cardTotalCents
              : invoice.amountDueCents
          }
          category={fallbackCategory}
        />
        <p>Preparing secure payment…</p>
      </div>
    )
  }

  return (
    <div aria-busy={busy}>
      <Elements
        stripe={stripe}
        options={{
          mode: 'payment',
          amount: session.chargeAmountCents,
          currency: session.currency.toLowerCase(),
          appearance: { theme: 'stripe' },
          paymentMethodTypes: types,
          paymentMethodOptions: types.includes('us_bank_account')
            ? {
                us_bank_account: {
                  verification_method: 'automatic',
                },
              }
            : undefined,
        }}
      >
        <CheckoutForm
          token={token}
          invoice={invoice}
          fallbackCategory={fallbackCategory}
          onBusy={setBusy}
          onSubmitted={() => setConfirming(true)}
          onProcessing={() => setProcessing(true)}
        />
      </Elements>
    </div>
  )
}

function ChargeSummary({
  invoice,
  surchargeCents,
  totalCents,
  category,
}: {
  invoice: PublicInvoice
  surchargeCents: number
  totalCents: number
  category: PaymentCategory
}) {
  return (
    <dl className="public-pay__totals">
      <div>
        <dt>Invoice amount</dt>
        <dd>
          {formatMoney(invoice.amountDueCents, invoice.currency)} {invoice.currency}
        </dd>
      </div>
      {category === 'card' && surchargeCents > 0 ? (
        <div>
          <dt>Card processing fee</dt>
          <dd>
            {formatMoney(surchargeCents, invoice.currency)} {invoice.currency}
          </dd>
        </div>
      ) : null}
      <div className="public-pay__totals-total">
        <dt>Total charged</dt>
        <dd>
          {formatMoney(totalCents, invoice.currency)} {invoice.currency}
        </dd>
      </div>
    </dl>
  )
}
