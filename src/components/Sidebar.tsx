import { useEffect, useRef } from 'react'
import { BRAND } from '../branding.ts'
import { useFocusTrap } from '../hooks/useFocusTrap.ts'
import { useAppView } from '../nav/AppViewContext.tsx'
import type { AppView } from '../types/person.ts'
import { IconDocument, IconInvoices, IconPeople, IconSettings, IconX } from './icons.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'
import './Sidebar.css'

type SidebarProps = {
  open: boolean
  isDesktop: boolean
  onClose: () => void
}

export function Sidebar({ open, isDesktop, onClose }: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const isOverlay = open && !isDesktop
  const { view, setView } = useAppView()

  useFocusTrap(isOverlay, sidebarRef, onClose)

  useEffect(() => {
    if (!isOverlay) {
      return
    }
    closeRef.current?.focus()
  }, [isOverlay])

  function goTo(next: AppView) {
    setView(next)
    onClose()
  }

  return (
    <aside
      ref={sidebarRef}
      id="app-sidebar"
      className={open ? 'sidebar is-open' : 'sidebar'}
      aria-label="Application"
      aria-hidden={!isDesktop && !open ? true : undefined}
      {...(!isDesktop && !open ? { inert: true } : {})}
      tabIndex={-1}
    >
      <div className="sidebar__top">
        <div className="sidebar__brand">
          <div className="brand-lockup sidebar__icon-wrap">
            <img
              src={BRAND.icon}
              alt="Bitz Designs"
              width={51}
              height={40}
            />
          </div>
          <div className="sidebar__brand-text">
            <span className="sidebar__product">Invoice Creator</span>
            <span className="sidebar__meta">Internal</span>
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="sidebar__close btn btn--icon"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <IconX />
        </button>
      </div>

      <nav className="sidebar__nav" aria-label="Primary">
        <button
          type="button"
          className={view === 'invoice' ? 'sidebar__link is-active' : 'sidebar__link'}
          aria-current={view === 'invoice' ? 'page' : undefined}
          onClick={() => goTo('invoice')}
        >
          <IconDocument />
          New Invoice
        </button>
        <button
          type="button"
          className={view === 'invoices' ? 'sidebar__link is-active' : 'sidebar__link'}
          aria-current={view === 'invoices' ? 'page' : undefined}
          onClick={() => goTo('invoices')}
        >
          <IconInvoices />
          Invoices
        </button>
        <button
          type="button"
          className={view === 'people' ? 'sidebar__link is-active' : 'sidebar__link'}
          aria-current={view === 'people' ? 'page' : undefined}
          onClick={() => goTo('people')}
        >
          <IconPeople />
          People
        </button>
        <button
          type="button"
          className={view === 'settings' ? 'sidebar__link is-active' : 'sidebar__link'}
          aria-current={view === 'settings' ? 'page' : undefined}
          onClick={() => goTo('settings')}
        >
          <IconSettings />
          Settings
        </button>
      </nav>

      <div className="sidebar__footer">
        <ThemeToggle />
      </div>
    </aside>
  )
}
