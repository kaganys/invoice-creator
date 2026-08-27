import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchSession, type SessionPayload } from '../api/session.ts'
import { hasPermission, type Permission } from '../auth/permissions.ts'

type SessionContextValue = {
  session: SessionPayload | null
  loading: boolean
  error: string | null
  companyId: string | null
  can: (permission: Permission) => boolean
  switchCompany: (companyId: string) => void
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(
    () => window.sessionStorage.getItem('bitz-company-id'),
  )

  const refresh = useCallback(async () => {
    const payload = await fetchSession()
    setSession(payload)
    const nextId =
      payload.currentCompany?.id ??
      payload.companies[0]?.id ??
      null
    if (nextId && nextId !== companyId) {
      window.sessionStorage.setItem('bitz-company-id', nextId)
      setCompanyId(nextId)
    }
    if (!payload.invited) {
      window.sessionStorage.removeItem('bitz-company-id')
      setCompanyId(null)
    }
  }, [companyId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .then(() => {
        if (!cancelled) {
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not load your Cloudflare login.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  const switchCompany = useCallback((nextId: string) => {
    window.sessionStorage.setItem('bitz-company-id', nextId)
    setCompanyId(nextId)
    window.location.reload()
  }, [])

  const can = useCallback(
    (permission: Permission) =>
      hasPermission(session?.currentCompany?.permissions, permission),
    [session],
  )

  const value = useMemo(
    () => ({
      session,
      loading,
      error,
      companyId,
      can,
      switchCompany,
      refresh,
    }),
    [session, loading, error, companyId, can, switchCompany, refresh],
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return context
}
