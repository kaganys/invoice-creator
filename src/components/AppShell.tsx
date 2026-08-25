import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { DESKTOP_NAV_QUERY, useMediaQuery } from '../hooks/useMediaQuery.ts'
import { Header } from './Header.tsx'
import { InvoicePreviewModal } from './InvoicePreviewModal.tsx'
import { Sidebar } from './Sidebar.tsx'
import './AppShell.css'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const isDesktop = useMediaQuery(DESKTOP_NAV_QUERY)
  const [navOpen, setNavOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (isDesktop) {
      setNavOpen(false)
    }
  }, [isDesktop])

  const closeNav = useCallback(() => setNavOpen(false), [])
  const openPreview = useCallback(() => {
    setNavOpen(false)
    setPreviewOpen(true)
  }, [])
  const closePreview = useCallback(() => setPreviewOpen(false), [])

  const showMobileNav = navOpen && !isDesktop

  useEffect(() => {
    if (!showMobileNav) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showMobileNav])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-shell__body" {...(previewOpen ? { inert: true } : {})}>
        {showMobileNav ? (
          <button
            type="button"
            className="app-shell__nav-backdrop"
            aria-label="Close navigation"
            onClick={closeNav}
          />
        ) : null}
        <Sidebar
          open={navOpen}
          isDesktop={isDesktop}
          onClose={closeNav}
        />
        <div
          className="app-shell__main-column"
          {...(showMobileNav ? { inert: true } : {})}
        >
          <Header
            navOpen={showMobileNav}
            onMenuClick={() => setNavOpen(true)}
            onPreview={openPreview}
          />
          <main id="main-content" className="app-shell__main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <InvoicePreviewModal open={previewOpen} onClose={closePreview} />
    </div>
  )
}
