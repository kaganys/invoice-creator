import { useEffect, useState } from 'react'
import {
  fetchPublicInvoice,
  type PublicInvoiceResponse,
} from '../../api/publicInvoice.ts'
import { CardCheckout } from './CardCheckout.tsx'
import './PublicInvoicePage.css'

export function PublicInvoicePage({ token }: { token: string }) {
  const [payload, setPayload] = useState<PublicInvoiceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadInvoice() {
    return fetchPublicInvoice(token)
      .then((result) => {
        setPayload(result)
        setError(null)
      })
      .catch(() => {
        setError('This payment link is invalid or expired.')
      })
  }

  useEffect(() => {
    let cancelled = false
    fetchPublicInvoice(token)
      .then((result) => {
        if (!cancelled) {
          setPayload(result)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('This payment link is invalid or expired.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const state = payload?.state ?? (error ? 'invalid' : null)
  const invoice = payload?.invoice

  return (
    <div className="public-pay">
      <div className="public-pay__card">
        {invoice?.logoPath ? (
          <img className="public-pay__logo" src={invoice.logoPath} alt="" />
        ) : null}
        {!payload && !error ? <p>Loading invoice…</p> : null}
        {state === 'invalid' ? (
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
                void loadInvoice()
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
