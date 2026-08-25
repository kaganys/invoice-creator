import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  const [elementReady, setElementReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPay(event: FormEvent) {
    event.preventDefault()
    if (!stripe || !elements || submitting || !elementReady) {
      return
    }
    setSubmitting(true)
    onBusy(true)
    setError(null)
    try {
      // Required so Stripe validates fields and the Payment Element is fully wired
      // before confirmPayment looks up the mounted element.
      const submitted = await elements.submit()
      if (submitted.error) {
        setError(submitted.error.message || 'Check your card details and try again.')
        return
      }

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

  const canPay = Boolean(stripe && elements && elementReady && !submitting)

  return (
    <form className="public-pay__stripe" onSubmit={(event) => void onPay(event)}>
      <PaymentElement
        onReady={() => {
          setElementReady(true)
        }}
        options={{
          layout: 'tabs',
        }}
      />
      {error ? <p className="public-pay__error">{error}</p> : null}
      {!elementReady ? (
        <p className="public-pay__card-note">Loading secure card form…</p>
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
          setDelayed(false)
          onPaidRef.current?.()
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
      // ~2 minutes of retries, then slow background checks.
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
        <p className="public-pay__card-note">
          {delayed
            ? 'Your card was charged. We are waiting for final confirmation. You can refresh this page — if payment completed, it will show as already paid.'
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
        key={clientSecret}
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
