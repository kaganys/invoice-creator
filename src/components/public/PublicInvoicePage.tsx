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
  const [method, setMethod] = useState<'zelle' | 'card'>('zelle')

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
            <p className="public-pay__hero">
              {invoice.amountDue} {invoice.currency}
              {invoice.dueDate ? ` due ${invoice.dueDate}` : ''}
            </p>
            <dl className="public-pay__facts">
              <div>
                <dt>Bill to</dt>
                <dd>{invoice.customerName || '—'}</dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>{invoice.issueDate || '—'}</dd>
              </div>
            </dl>
            {invoice.lineItems.length > 0 ? (
              <table className="public-pay__table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((line, index) => (
                    <tr key={`${line.description}-${index}`}>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td>{line.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {invoice.paymentMemo ? (
              <p className="public-pay__memo">{invoice.paymentMemo}</p>
            ) : null}

            <div className="public-pay__methods" role="tablist" aria-label="Payment method">
              <button
                type="button"
                role="tab"
                aria-selected={method === 'zelle'}
                className={
                  method === 'zelle'
                    ? 'public-pay__method is-active'
                    : 'public-pay__method'
                }
                onClick={() => setMethod('zelle')}
              >
                Zelle
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === 'card'}
                className={
                  method === 'card'
                    ? 'public-pay__method is-active'
                    : 'public-pay__method'
                }
                onClick={() => setMethod('card')}
              >
                Credit card
              </button>
            </div>

            {method === 'zelle' ? (
              <div className="public-pay__zelle">
                <h2>Pay by Zelle</h2>
                <p className="public-pay__zelle-amount">
                  {invoice.amountDue} {invoice.currency}
                </p>
                {invoice.zelleEmail ? (
                  <p>
                    Send to{' '}
                    <a href={`mailto:${invoice.zelleEmail}`}>{invoice.zelleEmail}</a>
                  </p>
                ) : (
                  <p>Zelle details are not available on this invoice.</p>
                )}
                <p className="public-pay__card-note">
                  Use your invoice number as the memo if possible. Selecting Zelle
                  does not mark the invoice paid.
                </p>
              </div>
            ) : (
              <CardCheckout
                token={token}
                invoice={invoice}
                onAuthoritativePaid={() => {
                  void loadInvoice()
                }}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
