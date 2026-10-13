import { useEffect, useState } from 'react'
import { ApiError } from '../../api/http.ts'
import {
  createCompany,
  fetchCompanies,
  removeCompany,
  renameCompany,
  type CompanyAdminRow,
} from '../../api/session.ts'
import { useSession } from '../../session/SessionContext.tsx'
import { Field } from '../Field.tsx'
import './CompaniesPage.css'

function memberLabel(count: number): string {
  return count === 1 ? '1 member' : `${count} members`
}

export function CompaniesPage() {
  const { session, refresh } = useSession()
  const [companies, setCompanies] = useState<CompanyAdminRow[]>([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const payload = await fetchCompanies()
    setCompanies(payload.companies)
  }

  useEffect(() => {
    let cancelled = false
    load()
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load companies.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function message(caught: unknown, fallback: string): string {
    if (caught instanceof ApiError || caught instanceof Error) {
      return caught.message
    }
    return fallback
  }

  async function onAdd() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await createCompany(name)
      setName('')
      setNotice('Company added. Open it when you want to work there.')
      await load()
      await refresh()
    } catch (caught) {
      setError(message(caught, 'Could not add the company.'))
    } finally {
      setBusy(false)
    }
  }

  async function onRename(companyId: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await renameCompany(companyId, editName)
      setEditingId(null)
      setNotice('Company renamed.')
      await load()
      await refresh()
    } catch (caught) {
      setError(message(caught, 'Could not rename the company.'))
    } finally {
      setBusy(false)
    }
  }

  function openCompany(companyId: string) {
    window.sessionStorage.setItem('bitz-company-id', companyId)
    window.location.reload()
  }

  async function onRemove(company: CompanyAdminRow) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await removeCompany(company.id)
      setConfirmId(null)
      const remaining = companies.filter((item) => item.id !== company.id)
      if (company.current) {
        const next = remaining[0]
        if (next) {
          window.sessionStorage.setItem('bitz-company-id', next.id)
        } else {
          window.sessionStorage.removeItem('bitz-company-id')
        }
        window.location.reload()
        return
      }
      setNotice(`${company.name} was removed.`)
      await load()
      await refresh()
    } catch (caught) {
      setError(message(caught, 'Could not remove the company.'))
    } finally {
      setBusy(false)
    }
  }

  const confirming = companies.find((company) => company.id === confirmId) ?? null

  return (
    <div className="app-page companies-page">
      <h1 className="companies-page__title">Companies</h1>
      <p className="companies-page__intro">
        Companies on this login. Each one keeps its own invoices, people, and
        settings. A company that already has invoices cannot be removed.
      </p>
      {error ? <p className="api-banner api-banner--error">{error}</p> : null}
      {notice ? <p className="settings-status settings-status--success">{notice}</p> : null}

      <section className="companies-add">
        <h2>Add company</h2>
        <div className="companies-add__row">
          <Field label="Company name" htmlFor="new-company-name">
            <input
              id="new-company-name"
              className="field__input"
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void onAdd()
                }
              }}
            />
          </Field>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || name.trim().length < 2}
            onClick={() => void onAdd()}
          >
            Add company
          </button>
        </div>
      </section>

      <ul className="companies-list">
        {companies.map((company) => (
          <li key={company.id} className="companies-list__item">
            <div>
              <p className="companies-list__name">
                {company.name}
                {company.current ? <span className="companies-list__current">Current</span> : null}
              </p>
              <p className="companies-list__meta">
                {company.role} · {memberLabel(company.memberCount)}
                {company.invoiceCount > 0
                  ? ` · ${company.invoiceCount} invoice${company.invoiceCount === 1 ? '' : 's'}`
                  : ''}
              </p>
            </div>
            <div className="companies-list__actions">
              {editingId === company.id ? (
                <>
                  <input
                    className="field__input"
                    aria-label={`New name for ${company.name}`}
                    value={editName}
                    disabled={busy}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || !company.canRename}
                    onClick={() => void onRename(company.id)}
                  >
                    Save name
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {company.canRename ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(company.id)
                        setEditName(company.name)
                        setConfirmId(null)
                      }}
                    >
                      Rename
                    </button>
                  ) : null}
                  {company.current ? null : (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => openCompany(company.id)}
                    >
                      Open
                    </button>
                  )}
                  {company.canRemove && company.invoiceCount === 0 ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => {
                        setConfirmId(company.id)
                        setEditingId(null)
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                  {company.invoiceCount > 0 ? (
                    <span className="companies-list__locked">Has invoices</span>
                  ) : null}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {confirming ? (
        <div className="companies-confirm" role="dialog" aria-modal="true" aria-labelledby="remove-company-title">
          <h2 id="remove-company-title">Remove {confirming.name}?</h2>
          <p>
            This removes the company, its members, and its settings. It cannot
            be undone. {session?.currentCompany?.id === confirming.id
              ? 'You will be moved to another company on this login.'
              : 'Invoices are not deleted because this company has none.'}
          </p>
          <div className="companies-confirm__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void onRemove(confirming)}
            >
              Remove company
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => setConfirmId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
