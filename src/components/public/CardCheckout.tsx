import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createPublicPaymentIntent,
  fetchPublicInvoice,
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
  onSubmitted,
}: {
  amountLabel: string
  onBusy: (busy: boolean) => void
  onSubmitted: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      onSubmitted()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Card payment failed.')
    } finally {
      setSubmitting(false)
      onBusy(false)
    }
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
  onAuthoritativePaid,
}: {
  token: string
  invoice: PublicInvoice
  onAuthoritativePaid?: () => void
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [delayed, setDelayed] = useState(false)
  const [paid, setPaid] = useState(false)
  const onPaidRef = useRef(onAuthoritativePaid)
  onPaidRef.current = onAuthoritativePaid
  const publishableKey = invoice.stripePublishableKey
  const amountLabel = `${invoice.cardTotal} ${invoice.currency}`

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('redirect_status') === 'succeeded') {
      setConfirming(true)
    }
  }, [])

  useEffect(() => {
    if (!confirming || paid) {
      return
    }
    let cancelled = false
    let attempts = 0
    const poll = async () => {
      const result = await fetchPublicInvoice(token)
      if (cancelled) {
        return
      }
      if (result.state === 'paid') {
        setPaid(true)
        setConfirming(false)
        onPaidRef.current?.()
        return
      }
      attempts += 1
      if (attempts < 20) {
        window.setTimeout(() => {
          void poll()
        }, 1500)
      } else {
        setDelayed(true)
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [confirming, paid, token])

  useEffect(() => {
    if (confirming || paid) {
      return
    }
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
  }, [token, confirming, paid])

  const stripe = useMemo(
    () => (publishableKey ? stripePromise(publishableKey) : null),
    [publishableKey],
  )

  if (!invoice.cardPaymentAvailable || !publishableKey) {
    return (
      <p className="public-pay__card-note">
        Card payment is not available for this invoice.
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
  if (confirming) {
    return (
      <div>
        <p className="public-pay__success">
          Payment received. Confirming payment…
        </p>
        {delayed ? (
          <p className="public-pay__card-note">
            This can take a few seconds. You can refresh this page.
          </p>
        ) : null}
      </div>
    )
  }
  if (error) {
    return <p className="public-pay__error">{error}</p>
  }
  if (!clientSecret || !stripe) {
    return (
      <div>
        <ChargeSummary invoice={invoice} />
        <p>Preparing secure card payment…</p>
      </div>
    )
  }

  return (
    <div aria-busy={busy}>
      <ChargeSummary invoice={invoice} />
      <Elements
        stripe={stripe}
        options={{
          clientSecret,
          appearance: { theme: 'stripe' },
        }}
      >
        <CheckoutForm
          amountLabel={amountLabel}
          onBusy={setBusy}
          onSubmitted={() => setConfirming(true)}
        />
      </Elements>
    </div>
  )
}

function ChargeSummary({ invoice }: { invoice: PublicInvoice }) {
  return (
    <dl className="public-pay__totals">
      <div>
        <dt>Invoice amount</dt>
        <dd>
          {invoice.amountDue} {invoice.currency}
        </dd>
      </div>
      {invoice.cardFeeCents > 0 ? (
        <div>
          <dt>Card processing fee</dt>
          <dd>
            {invoice.cardFee} {invoice.currency}
          </dd>
        </div>
      ) : null}
      <div className="public-pay__totals-total">
        <dt>Total charged</dt>
        <dd>
          {invoice.cardTotal} {invoice.currency}
        </dd>
      </div>
    </dl>
  )
}
