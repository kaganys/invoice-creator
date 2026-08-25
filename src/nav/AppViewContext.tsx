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
}

const AppViewContext = createContext<AppViewContextValue | null>(null)

export function AppViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<AppView>('invoice')
  const setView = useCallback((next: AppView) => setViewState(next), [])
  const value = useMemo(() => ({ view, setView }), [view, setView])

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
