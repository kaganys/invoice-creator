import { BRAND } from '../branding.ts'
import { useInvoiceDraft } from '../invoice/InvoiceDraftContext.tsx'
import { useAppView } from '../nav/AppViewContext.tsx'
import { IconEye, IconMenu } from './icons.tsx'
import './Header.css'

type HeaderProps = {
  navOpen: boolean
  onMenuClick: () => void
  onPreview: () => void
}

function InvoiceTitle() {
  const { savedId, status } = useInvoiceDraft()
  return (
    <>
      <h1 className="header__title">
        {savedId ? 'Edit invoice' : 'New invoice'}
      </h1>
      <span className="badge">{status}</span>
    </>
  )
}

export function Header({ navOpen, onMenuClick, onPreview }: HeaderProps) {
  const { view } = useAppView()
  const title =
    view === 'invoices'
      ? 'Invoices'
      : view === 'people'
        ? 'People'
        : view === 'settings'
          ? 'Settings'
          : null

  return (
    <header className="header">
      <div className="header__left">
        <button
          type="button"
          className="header__menu btn btn--icon"
          aria-label="Open navigation"
          aria-controls="app-sidebar"
          aria-expanded={navOpen}
          onClick={onMenuClick}
        >
          <IconMenu />
        </button>
        <div className="brand-lockup header__wordmark-wrap">
          <img
            src={BRAND.wordmark}
            alt=""
            className="header__wordmark"
            width={151}
            height={32}
          />
        </div>
        <div className="header__title-group">
          {view === 'invoice' ? (
            <InvoiceTitle />
          ) : (
            <h1 className="header__title">{title}</h1>
          )}
        </div>
      </div>
      {view === 'invoice' ? (
        <div className="header__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onPreview}
            aria-label="Preview Invoice"
          >
            <IconEye />
            <span className="header__preview-label-full">Preview Invoice</span>
            <span className="header__preview-label-short">Preview</span>
          </button>
        </div>
      ) : null}
    </header>
  )
}
