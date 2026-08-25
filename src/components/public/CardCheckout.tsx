import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { useEffect, useMemo, useState } from 'react'
import {
  createPublicPaymentIntent,
  type PublicInvoice,
} from '../../api/publicInvoice.ts'

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
  amountLabel,
  onBusy,
}: {
  amountLabel: string
  onBusy: (busy: boolean) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function onPay() {
    if (!stripe || !elements || submitting) {
      return
    }
    setSubmitting(true)
    onBusy(true)
    setError(null)
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      })
      if (result.error) {
        setError(result.error.message || 'Card payment failed.')
        return
      }
      setSubmitted(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Card payment failed.')
    } finally {
      setSubmitting(false)
      onBusy(false)
    }
  }

  if (submitted) {
    return (
      <p className="public-pay__success">
        Your card payment was submitted for {amountLabel}. This invoice will be
        marked paid after the payment is confirmed.
      </p>
    )
  }

  return (
    <div className="public-pay__stripe">
      <PaymentElement />
      {error ? <p className="public-pay__error">{error}</p> : null}
      <button
        type="button"
        className="btn btn--primary public-pay__pay"
        disabled={!stripe || !elements || submitting}
        onClick={() => void onPay()}
      >
        {submitting ? 'Processing…' : `Pay ${amountLabel}`}
      </button>
    </div>
  )
}

export function CardCheckout({
  token,
  invoice,
}: {
  token: string
  invoice: PublicInvoice
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const publishableKey = invoice.stripePublishableKey

  useEffect(() => {
    let cancelled = false
    setError(null)
    createPublicPaymentIntent(token)
      .then((result) => {
        if (!cancelled) {
          setClientSecret(result.clientSecret)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not start card payment.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const stripe = useMemo(
    () => (publishableKey ? stripePromise(publishableKey) : null),
    [publishableKey],
  )

  if (!invoice.cardPaymentAvailable || !publishableKey) {
    return (
      <p className="public-pay__card-note">
        Card payment is not available. Please pay by Zelle.
      </p>
    )
  }

  if (error) {
    return <p className="public-pay__error">{error}</p>
  }
  if (!clientSecret || !stripe) {
    return <p>Preparing secure card payment…</p>
  }

  return (
    <div aria-busy={busy}>
      <dl className="public-pay__totals">
        <div>
          <dt>Invoice amount</dt>
          <dd>
            {invoice.amountDue} {invoice.currency}
          </dd>
        </div>
        <div>
          <dt>Card processing amount</dt>
          <dd>
            {invoice.cardTotal} {invoice.currency}
          </dd>
        </div>
        {invoice.cardFeeCents > 0 ? (
          <div>
            <dt>Includes card processing fee</dt>
            <dd>
              {invoice.cardFee} {invoice.currency}
            </dd>
          </div>
        ) : null}
      </dl>
      <Elements
        stripe={stripe}
        options={{
          clientSecret,
          appearance: { theme: 'stripe' },
        }}
      >
        <CheckoutForm
          amountLabel={`${invoice.cardTotal} ${invoice.currency}`}
          onBusy={setBusy}
        />
      </Elements>
    </div>
  )
}
