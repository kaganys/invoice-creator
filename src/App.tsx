import { AppShell } from './components/AppShell.tsx'
import { InvoiceEditor } from './components/editor/InvoiceEditor.tsx'
import { InvoicesPage } from './components/invoices/InvoicesPage.tsx'
import { PeoplePage } from './components/people/PeoplePage.tsx'
import { PublicInvoicePage } from './components/public/PublicInvoicePage.tsx'
import { SettingsPage } from './components/settings/SettingsPage.tsx'
import { BrandChrome } from './components/BrandChrome.tsx'
import { DirectoryProvider } from './directory/DirectoryContext.tsx'
import {
  classifyBrowserHostname,
  publicPaymentTokenFromPath,
} from './hosting/siteHost.ts'
import { InvoiceDraftProvider } from './invoice/InvoiceDraftContext.tsx'
import { SettingsProvider } from './settings/SettingsContext.tsx'
import { AppViewProvider, useAppView } from './nav/AppViewContext.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

function AppContent() {
  const { view } = useAppView()

  if (view === 'invoices') {
    return <InvoicesPage />
  }
  if (view === 'people') {
    return <PeoplePage />
  }
  if (view === 'settings') {
    return <SettingsPage />
  }
  return <InvoiceEditor />
}

function PublicOnlyShell({ token }: { token: string | null }) {
  if (token) {
    return (
      <ThemeProvider>
        <PublicInvoicePage token={token} />
      </ThemeProvider>
    )
  }
  return (
    <ThemeProvider>
      <div className="public-pay">
        <div className="public-pay__card">
          <h1>Bitz Designs</h1>
          <p>
            This site is for customer invoice payments only. Open the secure
            payment link from your invoice email.
          </p>
        </div>
      </div>
    </ThemeProvider>
  )
}

function LockedShell() {
  return (
    <ThemeProvider>
      <div className="public-pay">
        <div className="public-pay__card">
          <h1>Unavailable</h1>
          <p>
            This hostname is not available for the admin application. Use
            invoice.vrfnw.com or pay.vrfnw.com.
          </p>
        </div>
      </div>
    </ThemeProvider>
  )
}

function AdminApp() {
  return (
    <ThemeProvider>
      <DirectoryProvider>
        <SettingsProvider>
          <InvoiceDraftProvider>
            <AppViewProvider>
              <BrandChrome />
              <AppShell>
                <AppContent />
              </AppShell>
            </AppViewProvider>
          </InvoiceDraftProvider>
        </SettingsProvider>
      </DirectoryProvider>
    </ThemeProvider>
  )
}

export default function App() {
  const site = classifyBrowserHostname()
  const token = publicPaymentTokenFromPath()

  if (site === 'public') {
    return <PublicOnlyShell token={token} />
  }
  if (site === 'locked') {
    return <LockedShell />
  }
  // admin + local dev: payment links still work on the same origin for local testing
  if (token) {
    return <PublicOnlyShell token={token} />
  }
  return <AdminApp />
}
