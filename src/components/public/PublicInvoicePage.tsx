import { useEffect, useState } from 'react'
import {
  fetchPublicInvoice,
  type PublicInvoiceResponse,
} from '../../api/publicInvoice.ts'
import { CardCheckout } from './CardCheckout.tsx'
import './PublicInvoicePage.css'

const LOAD_TIMEOUT_MS = 15_000

async function fetchInvoiceWhenReady(
  token: string,
  signal: AbortSignal,
): Promise<PublicInvoiceResponse> {
  let last: PublicInvoiceResponse | null = null
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await fetchPublicInvoice(token, { signal })
    last = result
    if (result.state !== 'invalid') {
      return result
    }
    const waitMs = Math.min(200 * 2 ** attempt, 2000)
    await new Promise((resolve) => {
      window.setTimeout(resolve, waitMs)
    })
    if (signal.aborted) {
      break
    }
  }
  return last ?? { state: 'invalid', invoice: null }
}

export function PublicInvoicePage({ token }: { token: string }) {
  const [payload, setPayload] = useState<PublicInvoiceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function loadInvoice() {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      controller.abort()
    }, LOAD_TIMEOUT_MS)

    setLoading(true)
    setError(null)

    void fetchInvoiceWhenReady(token, controller.signal)
      .then((result) => {
        setPayload(result)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          setError(
            'Timed out loading this invoice. Confirm pay.vrfnw.com bypasses Cloudflare Access for /api/public/* , then try again.',
          )
          return
        }
        setError(
          caught instanceof Error
            ? caught.message
            : 'This payment link is invalid or expired.',
        )
      })
      .finally(() => {
        window.clearTimeout(timeout)
        setLoading(false)
      })

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }

  useEffect(() => {
    return loadInvoice()
  }, [token])

  const state = payload?.state ?? (error ? 'invalid' : null)
  const invoice = payload?.invoice

  return (
    <div className="public-pay">
      <div className="public-pay__card">
        {invoice?.logoPath ? (
          <img className="public-pay__logo" src={invoice.logoPath} alt="" />
        ) : null}
        {loading && !payload && !error ? <p>Loading invoice…</p> : null}
        {error && !invoice ? (
          <div>
            <h1>Link unavailable</h1>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn--primary public-pay__pay"
              onClick={() => {
                setPayload(null)
                loadInvoice()
              }}
            >
              Try again
            </button>
          </div>
        ) : null}
        {state === 'invalid' && !error ? (
          <div>
            <h1>Link unavailable</h1>
            <p>This payment link is invalid or expired.</p>
          </div>
        ) : null}
        {state === 'paid' ? (
          <div>
            <h1>Invoice already paid</h1>
            <p>No further payment is required.</p>
            {invoice?.number ? (
              <p className="public-pay__meta">{invoice.number}</p>
            ) : null}
          </div>
        ) : null}
        {state === 'void' ? (
          <div>
            <h1>This invoice is no longer payable</h1>
            <p>The payment link is closed.</p>
            {invoice?.number ? (
              <p className="public-pay__meta">{invoice.number}</p>
            ) : null}
          </div>
        ) : null}
        {state === 'processing' ? (
          <div>
            <h1>
              {invoice?.pendingKind === 'ach'
                ? 'Bank payment submitted'
                : 'Payment received'}
            </h1>
            <p className="public-pay__success">
              {invoice?.pendingKind === 'ach'
                ? 'Processing'
                : 'Confirming payment…'}
            </p>
            <p>
              {invoice?.pendingKind === 'ach'
                ? 'This invoice is not marked paid until the bank transfer completes. You can close this page and return later.'
                : 'This usually takes a few seconds. Refresh if this page does not update.'}
            </p>
            {invoice?.number ? (
              <p className="public-pay__meta">{invoice.number}</p>
            ) : null}
            <button
              type="button"
              className="btn btn--primary public-pay__pay"
              onClick={() => {
                setPayload(null)
                loadInvoice()
              }}
            >
              Refresh status
            </button>
          </div>
        ) : null}
        {state === 'payable' && invoice ? (
          <div>
            <p className="public-pay__kicker">{invoice.businessName}</p>
            <h1>Invoice {invoice.number}</h1>
            {invoice.dueDate || invoice.customerName ? (
              <p className="public-pay__meta">
                {[
                  invoice.customerName ? `Bill to ${invoice.customerName}` : null,
                  invoice.dueDate ? `Due ${invoice.dueDate}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : null}
            <CardCheckout
              token={token}
              invoice={invoice}
              onAuthoritativePaid={() => {
                loadInvoice()
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
