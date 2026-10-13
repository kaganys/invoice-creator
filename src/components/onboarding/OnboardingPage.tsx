import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { BrandingKind } from '../../branding.ts'
import { onboardCompany } from '../../api/session.ts'
import { useSession } from '../../session/SessionContext.tsx'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'
import { ThemeToggle } from '../ThemeToggle.tsx'
import './OnboardingPage.css'

const BRANDING_FIELDS: Array<{
  kind: BrandingKind
  title: string
  hint: string
}> = [
  {
    kind: 'site-wordmark',
    title: 'Wordmark',
    hint: 'Header logo. Optional.',
  },
  {
    kind: 'site-icon',
    title: 'Icon',
    hint: 'Sidebar / favicon. Optional.',
  },
  {
    kind: 'invoice-logo',
    title: 'Invoice logo',
    hint: 'Printed on invoices. Optional.',
  },
]

export function OnboardingPage() {
  const { session, refresh } = useSession()
  const [companyName, setCompanyName] = useState('')
  const [ownerName, setOwnerName] = useState(session?.name ?? '')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState(session?.email ?? '')
  const [zelleEmail, setZelleEmail] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [files, setFiles] = useState<Partial<Record<BrandingKind, File>>>({})
  const [previews, setPreviews] = useState<Partial<Record<BrandingKind, string>>>(
    {},
  )
  const previewsRef = useRef(previews)
  previewsRef.current = previews
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      for (const url of Object.values(previewsRef.current)) {
        if (url) {
          URL.revokeObjectURL(url)
        }
      }
    }
  }, [])

  function onFile(kind: BrandingKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setFiles((current) => {
      const next = { ...current }
      if (file) {
        next[kind] = file
      } else {
        delete next[kind]
      }
      return next
    })
    setPreviews((current) => {
      const previous = current[kind]
      if (previous) {
        URL.revokeObjectURL(previous)
      }
      return file
        ? { ...current, [kind]: URL.createObjectURL(file) }
        : { ...current, [kind]: undefined }
    })
  }

  async function onSubmit() {
    setBusy(true)
    setError(null)
    try {
      const result = await onboardCompany({
        companyName,
        ownerName,
        fromName: fromName || ownerName || companyName,
        fromEmail,
        zelleEmail,
        inviteCode,
        wordmark: files['site-wordmark'],
        icon: files['site-icon'],
        invoiceLogo: files['invoice-logo'],
      })
      window.sessionStorage.setItem('bitz-company-id', result.company.id)
      await refresh()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not create the company.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboard">
      <header className="onboard__top">
        <div>
          <p className="onboard__kicker">New company</p>
          <h1>Set up the company</h1>
          <p>
            Signed in as <strong>{session?.email}</strong>. This email is not
            on a company yet. Logos are optional and can be added later in
            Settings.
          </p>
        </div>
        <ThemeToggle />
      </header>

      {error ? <p className="api-banner api-banner--error">{error}</p> : null}

      <InvoiceSection
        title="Company"
        description="This name appears on invoices, emails, and the payment page."
      >
        <div className="form-grid form-grid--2">
          <Field label="Company name" htmlFor="onboard-company">
            <input
              id="onboard-company"
              className="field__input"
              value={companyName}
              autoComplete="organization"
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </Field>
          <Field label="Your name" htmlFor="onboard-owner">
            <input
              id="onboard-owner"
              className="field__input"
              value={ownerName}
              autoComplete="name"
              onChange={(event) => setOwnerName(event.target.value)}
            />
          </Field>
          <Field label="From name (optional)" htmlFor="onboard-from-name">
            <input
              id="onboard-from-name"
              className="field__input"
              value={fromName}
              placeholder={ownerName || companyName || 'Shown on emails'}
              onChange={(event) => setFromName(event.target.value)}
            />
          </Field>
          <Field label="From email (optional)" htmlFor="onboard-from-email">
            <input
              id="onboard-from-email"
              className="field__input"
              type="email"
              value={fromEmail}
              onChange={(event) => setFromEmail(event.target.value)}
            />
          </Field>
          <Field label="Zelle email (optional)" htmlFor="onboard-zelle">
            <input
              id="onboard-zelle"
              className="field__input"
              type="email"
              value={zelleEmail}
              onChange={(event) => setZelleEmail(event.target.value)}
            />
          </Field>
          <Field label="Invite code" htmlFor="onboard-invite">
            <input
              id="onboard-invite"
              className="field__input"
              value={inviteCode}
              autoComplete="off"
              placeholder="Required outside local development"
              onChange={(event) => setInviteCode(event.target.value)}
            />
          </Field>
        </div>
      </InvoiceSection>

      <InvoiceSection
        title="Branding (optional)"
        description="PNG, JPEG, or WebP, 2 MB or smaller. Skip any you do not have yet."
      >
        <div className="onboard-branding">
          {BRANDING_FIELDS.map((asset) => (
            <label key={asset.kind} className="onboard-branding__card">
              <span className="onboard-branding__preview">
                {previews[asset.kind] ? (
                  <img src={previews[asset.kind]} alt="" />
                ) : (
                  <span>No image</span>
                )}
              </span>
              <span className="onboard-branding__copy">
                <strong>{asset.title}</strong>
                <span>{asset.hint}</span>
                <span className="onboard-branding__file">
                  {files[asset.kind]?.name || 'Choose file'}
                </span>
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="visually-hidden"
                onChange={(event) => onFile(asset.kind, event)}
              />
            </label>
          ))}
        </div>
      </InvoiceSection>

      <div className="onboard__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || companyName.trim().length < 2}
          onClick={() => void onSubmit()}
        >
          {busy ? 'Creating…' : 'Create company'}
        </button>
      </div>
    </div>
  )
}
