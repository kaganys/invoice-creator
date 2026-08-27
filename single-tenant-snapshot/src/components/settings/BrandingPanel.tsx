import { useRef, useState } from 'react'
import { BRAND, type BrandingKind } from '../../branding.ts'
import { useSettings } from '../../settings/SettingsContext.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

const ASSETS: Array<{
  kind: BrandingKind
  title: string
  usedFor: string
  key: 'siteWordmark' | 'siteIcon' | 'invoiceLogo'
}> = [
  {
    kind: 'site-wordmark',
    title: 'Site wordmark',
    usedFor: 'Primary branding in the admin header.',
    key: 'siteWordmark',
  },
  {
    kind: 'site-icon',
    title: 'Site icon / favicon',
    usedFor: 'Compact sidebar branding and the browser favicon.',
    key: 'siteIcon',
  },
  {
    kind: 'invoice-logo',
    title: 'Invoice logo',
    usedFor:
      'Logo inside generated invoices. New invoices snapshot the current logo path. Historical invoices keep the path they were saved with.',
    key: 'invoiceLogo',
  },
]

export function BrandingPanel() {
  const { branding, loading, saving, error, uploadAsset, restoreAsset } =
    useSettings()
  const [success, setSuccess] = useState<string | null>(null)
  const [busyKind, setBusyKind] = useState<BrandingKind | null>(null)
  const wordmarkInput = useRef<HTMLInputElement>(null)
  const iconInput = useRef<HTMLInputElement>(null)
  const invoiceInput = useRef<HTMLInputElement>(null)
  const inputs = {
    'site-wordmark': wordmarkInput,
    'site-icon': iconInput,
    'invoice-logo': invoiceInput,
  }

  async function onFile(kind: BrandingKind, file: File | undefined) {
    if (!file) {
      return
    }
    setSuccess(null)
    setBusyKind(kind)
    try {
      await uploadAsset(kind, file)
      setSuccess('Branding image replaced.')
    } catch {
      // Context stores the API error.
    } finally {
      setBusyKind(null)
    }
  }

  async function onRestore(kind: BrandingKind) {
    setSuccess(null)
    setBusyKind(kind)
    try {
      await restoreAsset(kind)
      setSuccess('Restored the built-in Bitz Designs asset.')
    } catch {
      // Context error.
    } finally {
      setBusyKind(null)
    }
  }

  return (
    <InvoiceSection
      title="Branding"
      description="Upload a replacement for each asset independently. Built-in files in public/branding/ stay as Restore default."
    >
      {loading ? <p className="settings-status">Loading branding…</p> : null}
      <p className="settings-help">
        PNG, JPEG, or WebP, 2 MB or smaller. SVG is not accepted. Uploads are
        stored in the branding bucket; D1 only keeps the file path.
      </p>
      <div className="branding-assets">
        {ASSETS.map((asset) => {
          const current = branding[asset.key]
          const path = current.url || current.path || BRAND.icon
          return (
            <article key={asset.kind} className="branding-card">
              <div className="branding-card__preview">
                <img src={path} alt="" />
              </div>
              <div className="branding-card__body">
                <h3>{asset.title}</h3>
                <p className="settings-help">{asset.usedFor}</p>
                <p className="settings-help">
                  {current.isDefault
                    ? 'Currently using the built-in Bitz Designs file.'
                    : 'Currently using an uploaded replacement.'}
                </p>
                <p className="settings-example">{path}</p>
                <input
                  ref={inputs[asset.kind]}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="visually-hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    void onFile(asset.kind, file)
                  }}
                />
                <div className="branding-card__actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={saving || loading}
                    onClick={() => inputs[asset.kind].current?.click()}
                  >
                    {busyKind === asset.kind ? 'Working…' : 'Upload / replace'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={saving || loading || current.isDefault}
                    onClick={() => void onRestore(asset.kind)}
                  >
                    Restore default
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      {success ? (
        <p className="settings-status settings-status--success">{success}</p>
      ) : null}
      {error ? (
        <p className="settings-status settings-status--error">{error}</p>
      ) : null}
    </InvoiceSection>
  )
}
