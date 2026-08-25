import { AppShell } from './components/AppShell.tsx'
import { InvoiceEditor } from './components/editor/InvoiceEditor.tsx'
import { InvoicesPage } from './components/invoices/InvoicesPage.tsx'
import { PeoplePage } from './components/people/PeoplePage.tsx'
import { SettingsPage } from './components/settings/SettingsPage.tsx'
import { DirectoryProvider } from './directory/DirectoryContext.tsx'
import { InvoiceDraftProvider } from './invoice/InvoiceDraftContext.tsx'
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

export default function App() {
  return (
    <ThemeProvider>
      <DirectoryProvider>
        <InvoiceDraftProvider>
          <AppViewProvider>
            <AppShell>
              <AppContent />
            </AppShell>
          </AppViewProvider>
        </InvoiceDraftProvider>
      </DirectoryProvider>
    </ThemeProvider>
  )
}
