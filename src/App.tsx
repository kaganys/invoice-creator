import { AppShell } from './components/AppShell.tsx'
import { InvoiceEditor } from './components/editor/InvoiceEditor.tsx'
import { InvoicesPage } from './components/invoices/InvoicesPage.tsx'
import { PeoplePage } from './components/people/PeoplePage.tsx'
import { PublicInvoicePage } from './components/public/PublicInvoicePage.tsx'
import { SettingsPage } from './components/settings/SettingsPage.tsx'
import { BrandChrome } from './components/BrandChrome.tsx'
import { DirectoryProvider } from './directory/DirectoryContext.tsx'
import { InvoiceDraftProvider } from './invoice/InvoiceDraftContext.tsx'
import { SettingsProvider } from './settings/SettingsContext.tsx'
import { AppViewProvider, useAppView } from './nav/AppViewContext.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

function publicPaymentToken(): string | null {
  const match = /^\/i\/([^/]+)$/.exec(window.location.pathname)
  return match?.[1] ?? null
}

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

export default function App() {
  const token = publicPaymentToken()
  if (token) {
    return (
      <ThemeProvider>
        <PublicInvoicePage token={token} />
      </ThemeProvider>
    )
  }

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
