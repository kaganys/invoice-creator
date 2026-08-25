import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../api/http.ts'
import { fetchInvoices } from '../../api/invoices.ts'
import { useInvoiceDraft } from '../../invoice/InvoiceDraftContext.tsx'
import { useAppView } from '../../nav/AppViewContext.tsx'
import type { InvoiceListItem } from '../../types/invoice.ts'
import { formatInvoiceDate } from '../../utils/dates.ts'
import { formatMoney } from '../../utils/money.ts'
import './InvoicesPage.css'

export function InvoicesPage() {
  const { setView } = useAppView()
  const { startNewInvoice, loadSavedInvoice, deleteSavedDraft, saving } =
    useInvoiceDraft()
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const rows = await fetchInvoices()
    setInvoices(rows)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .then(() => {
        if (!cancelled) {
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Could not load invoices.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  async function openInvoice(id: string) {
    try {
      await loadSavedInvoice(id)
      setView('invoice')
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not open invoice.',
      )
    }
  }

  async function confirmDelete(id: string) {
    try {
      const deleted = await deleteSavedDraft(id)
      if (!deleted) {
        return
      }
      setInvoices((current) => current.filter((row) => row.id !== id))
      setPendingDeleteId(null)
      setError(null)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not delete invoice.',
      )
    }
  }

  return (
    <div className="app-page">
      <div className="invoices-toolbar">
        <p className="invoices-toolbar__hint">
          Saved invoices live in D1. The editor working copy is only a local
          recovery draft until you save.
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            startNewInvoice()
            setView('invoice')
          }}
        >
          New invoice
        </button>
      </div>

      {error ? <p className="api-banner api-banner--error">{error}</p> : null}
      {loading ? <p className="api-banner">Loading invoices…</p> : null}

      {!loading && invoices.length === 0 ? (
        <p className="people-empty">No saved invoices yet.</p>
      ) : null}

      {invoices.length > 0 ? (
        <div className="invoices-table-wrap">
          <table className="invoices-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Issue date</th>
                <th>Due date</th>
                <th>Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((row) => {
                const deleting = pendingDeleteId === row.id
                return (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className="invoices-table__link"
                        onClick={() => void openInvoice(row.id)}
                      >
                        {row.number}
                      </button>
                    </td>
                    <td>{row.customerName || '—'}</td>
                    <td>{row.issueDate ? formatInvoiceDate(row.issueDate) : '—'}</td>
                    <td>{row.dueDate ? formatInvoiceDate(row.dueDate) : '—'}</td>
                    <td>{formatMoney(row.amountCents, row.currency)}</td>
                    <td>
                      <span className="badge">{row.status}</span>
                    </td>
                    <td>
                      {row.status === 'draft' ? (
                        deleting ? (
                          <div className="invoices-table__confirm">
                            <button
                              type="button"
                              className="btn btn--ghost"
                              disabled={saving}
                              onClick={() => setPendingDeleteId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger"
                              disabled={saving}
                              onClick={() => void confirmDelete(row.id)}
                            >
                              Confirm
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => setPendingDeleteId(row.id)}
                          >
                            Delete
                          </button>
                        )
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
