import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppView } from '../types/person.ts'

type AppViewContextValue = {
  view: AppView
  setView: (view: AppView) => void
  detailInvoiceId: string | null
  openInvoiceDetail: (id: string) => void
  closeInvoiceDetail: () => void
  invoiceListEpoch: number
  bumpInvoiceList: () => void
}

const AppViewContext = createContext<AppViewContextValue | null>(null)

export function AppViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<AppView>('invoice')
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)
  const [invoiceListEpoch, setInvoiceListEpoch] = useState(0)
  const setView = useCallback((next: AppView) => setViewState(next), [])
  const openInvoiceDetail = useCallback((id: string) => {
    setDetailInvoiceId(id)
  }, [])
  const closeInvoiceDetail = useCallback(() => {
    setDetailInvoiceId(null)
  }, [])
  const bumpInvoiceList = useCallback(() => {
    setInvoiceListEpoch((current) => current + 1)
  }, [])
  const value = useMemo(
    () => ({
      view,
      setView,
      detailInvoiceId,
      openInvoiceDetail,
      closeInvoiceDetail,
      invoiceListEpoch,
      bumpInvoiceList,
    }),
    [
      view,
      setView,
      detailInvoiceId,
      openInvoiceDetail,
      closeInvoiceDetail,
      invoiceListEpoch,
      bumpInvoiceList,
    ],
  )

  return (
    <AppViewContext.Provider value={value}>{children}</AppViewContext.Provider>
  )
}

export function useAppView(): AppViewContextValue {
  const context = useContext(AppViewContext)
  if (!context) {
    throw new Error('useAppView must be used within AppViewProvider')
  }
  return context
}
