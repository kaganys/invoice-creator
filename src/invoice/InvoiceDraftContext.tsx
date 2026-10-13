import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError } from '../api/http.ts'
import {
  createInvoice,
  deleteInvoice,
  fetchInvoice,
  updateInvoice,
} from '../api/invoices.ts'
import { createEmptyLineItem } from '../data/defaultInvoice.ts'
import { useDirectory } from '../directory/DirectoryContext.tsx'
import { useSettings } from '../settings/SettingsContext.tsx'
import { partyFromPerson } from '../types/person.ts'
import {
  payloadToInvoiceDefaults,
  snapshotNewInvoice,
} from '../utils/invoiceDefaults.ts'
import {
  BUILTIN_INVOICE_LOGO,
  type Address,
  type Invoice,
  type InvoiceErrors,
  type InvoiceLineItem,
  type InvoiceParty,
  type InvoicePayment,
  type InvoiceStatus,
  type SavedInvoice,
} from '../types/invoice.ts'
import { calculateInvoiceTotals, type InvoiceTotals } from '../utils/invoiceCalculations.ts'
import {
  hasMeaningfulDraftContent,
  loadWorkingDraft,
  saveWorkingDraft,
} from '../utils/invoiceStorage.ts'
import { hasInvoiceErrors, validateInvoice } from '../utils/invoiceValidation.ts'

type InvoiceDraftContextValue = {
  invoice: Invoice
  totals: InvoiceTotals
  errors: InvoiceErrors
  savedId: string | null
  status: InvoiceStatus
  saving: boolean
  saveError: string | null
  touch: (key: string) => void
  visibleError: (
    key: string,
    error: string | undefined,
    value: string,
  ) => string | undefined
  patchInvoice: (patch: Partial<Pick<Invoice, 'number' | 'issueDate' | 'dueDate' | 'currency' | 'notes'>>) => void
  setStatus: (status: InvoiceStatus) => void
  setFromParty: (party: InvoiceParty) => void
  setCustomerParty: (party: InvoiceParty) => void
  patchFrom: (patch: Partial<Omit<InvoiceParty, 'address'>>) => void
  patchCustomer: (patch: Partial<Omit<InvoiceParty, 'address'>>) => void
  patchFromAddress: (patch: Partial<Address>) => void
  patchCustomerAddress: (patch: Partial<Address>) => void
  patchPayment: (patch: Partial<InvoicePayment>) => void
  updateLineItem: (id: string, patch: Partial<InvoiceLineItem>) => void
  addLineItem: () => void
  removeLineItem: (id: string) => void
  resetDraft: () => void
  startNewInvoice: () => void
  saveInvoice: () => Promise<string | null>
  loadSavedInvoice: (id: string) => Promise<void>
  deleteSavedDraft: (id?: string) => Promise<boolean>
}

const InvoiceDraftContext = createContext<InvoiceDraftContextValue | null>(null)

function savedToInvoice(saved: SavedInvoice): Invoice {
  return {
    number: saved.number,
    issueDate: saved.issueDate,
    dueDate: saved.dueDate,
    currency: saved.currency,
    from: {
      name: saved.from.name,
      email: saved.from.email,
      address: { ...saved.from.address },
    },
    customer: {
      name: saved.customer.name,
      email: saved.customer.email,
      address: { ...saved.customer.address },
    },
    lineItems: saved.lineItems.map((item) => ({ ...item })),
    payment: { ...saved.payment },
    notes: saved.notes,
    invoiceLogo: { ...(saved.invoiceLogo ?? BUILTIN_INVOICE_LOGO) },
  }
}

export function InvoiceDraftProvider({ children }: { children: ReactNode }) {
  const {
    people,
    defaultFromId: directoryDefaultFromId,
    loading: directoryLoading,
  } = useDirectory()
  const {
    defaults,
    loading: settingsLoading,
    allocateNumber,
    currentInvoiceLogo,
  } = useSettings()
  const initial = loadWorkingDraft()
  const persistEnabled = useRef(
    Boolean(initial.savedId) ||
      (initial.recovered && hasMeaningfulDraftContent(initial.invoice)),
  )
  const keepInitialDraft = persistEnabled.current
  const [invoice, setInvoice] = useState<Invoice>(initial.invoice)
  const [savedId, setSavedId] = useState<string | null>(initial.savedId)
  const [status, setStatus] = useState<InvoiceStatus>(initial.status)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const appliedDefaults = useRef(false)

  useEffect(() => {
    if (!persistEnabled.current) {
      return
    }
    saveWorkingDraft({ invoice, savedId, status })
  }, [invoice, savedId, status])

  const applyFreshDraft = useCallback(async () => {
    const fromId = defaults.defaultFromId || directoryDefaultFromId
    const person = fromId
      ? people.find((entry) => entry.id === fromId)
      : undefined
    let number: string
    try {
      number = await allocateNumber()
    } catch {
      number = ''
    }
    const next = snapshotNewInvoice({
      defaults: payloadToInvoiceDefaults(defaults),
      fromPerson: person ? partyFromPerson(person) : null,
      number,
      invoiceLogo: currentInvoiceLogo,
    })
    persistEnabled.current = true
    setInvoice(next)
    setSavedId(null)
    setStatus('draft')
    setTouched({})
    setSaveError(null)
  }, [
    allocateNumber,
    currentInvoiceLogo,
    defaults,
    directoryDefaultFromId,
    people,
  ])

  useEffect(() => {
    if (directoryLoading || settingsLoading || appliedDefaults.current) {
      return
    }

    if (keepInitialDraft || savedId) {
      appliedDefaults.current = true
      persistEnabled.current = true
      return
    }

    appliedDefaults.current = true
    void applyFreshDraft()
  }, [
    applyFreshDraft,
    directoryLoading,
    keepInitialDraft,
    savedId,
    settingsLoading,
  ])

  useEffect(() => {
    if (settingsLoading || savedId) {
      return
    }
    const memo = payloadToInvoiceDefaults(defaults).paymentMemo
    if (!memo) {
      return
    }
    setInvoice((current) => {
      if (current.payment.memo.trim()) {
        return current
      }
      return {
        ...current,
        payment: { ...current.payment, memo },
      }
    })
  }, [defaults, savedId, settingsLoading])

  const totals = useMemo(() => calculateInvoiceTotals(invoice), [invoice])
  const errors = useMemo(() => validateInvoice(invoice), [invoice])

  const patchInvoice: InvoiceDraftContextValue['patchInvoice'] = useCallback(
    (patch) => {
      setInvoice((current) => ({ ...current, ...patch }))
    },
    [],
  )

  const setFromParty = useCallback((party: InvoiceParty) => {
    setInvoice((current) => ({
      ...current,
      from: {
        name: party.name,
        email: party.email,
        address: { ...party.address },
      },
    }))
  }, [])

  const setCustomerParty = useCallback((party: InvoiceParty) => {
    setInvoice((current) => ({
      ...current,
      customer: {
        name: party.name,
        email: party.email,
        address: { ...party.address },
      },
    }))
  }, [])

  const patchFrom = useCallback((patch: Partial<Omit<InvoiceParty, 'address'>>) => {
    setInvoice((current) => ({
      ...current,
      from: { ...current.from, ...patch },
    }))
  }, [])

  const patchCustomer = useCallback(
    (patch: Partial<Omit<InvoiceParty, 'address'>>) => {
      setInvoice((current) => ({
        ...current,
        customer: { ...current.customer, ...patch },
      }))
    },
    [],
  )

  const patchFromAddress = useCallback((patch: Partial<Address>) => {
    setInvoice((current) => ({
      ...current,
      from: {
        ...current.from,
        address: { ...current.from.address, ...patch },
      },
    }))
  }, [])

  const patchCustomerAddress = useCallback((patch: Partial<Address>) => {
    setInvoice((current) => ({
      ...current,
      customer: {
        ...current.customer,
        address: { ...current.customer.address, ...patch },
      },
    }))
  }, [])

  const patchPayment = useCallback((patch: Partial<InvoicePayment>) => {
    setInvoice((current) => ({
      ...current,
      payment: { ...current.payment, ...patch },
    }))
  }, [])

  const updateLineItem = useCallback(
    (id: string, patch: Partial<InvoiceLineItem>) => {
      setInvoice((current) => ({
        ...current,
        lineItems: current.lineItems.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      }))
    },
    [],
  )

  const addLineItem = useCallback(() => {
    setInvoice((current) => ({
      ...current,
      lineItems: [...current.lineItems, createEmptyLineItem()],
    }))
  }, [])

  const removeLineItem = useCallback((id: string) => {
    setInvoice((current) => {
      if (current.lineItems.length <= 1) {
        return current
      }
      return {
        ...current,
        lineItems: current.lineItems.filter((item) => item.id !== id),
      }
    })
  }, [])

  const touch = useCallback((key: string) => {
    setTouched((current) =>
      current[key] ? current : { ...current, [key]: true },
    )
  }, [])

  const visibleError = useCallback(
    (key: string, error: string | undefined, value: string) => {
      if (!error) {
        return undefined
      }
      if (!touched[key] && value.trim() === '') {
        return undefined
      }
      return error
    },
    [touched],
  )

  const resetDraft = useCallback(() => {
    void applyFreshDraft()
  }, [applyFreshDraft])

  const startNewInvoice = useCallback(() => {
    void applyFreshDraft()
  }, [applyFreshDraft])

  const saveInvoice = useCallback(async () => {
    const nextErrors = validateInvoice(invoice)
    if (hasInvoiceErrors(nextErrors)) {
      const keys: Record<string, boolean> = {
        number: true,
        dueDate: true,
        fromEmail: true,
        customerName: true,
        customerEmail: true,
        zelleEmail: true,
        cardFeePercent: true,
        cardFeeFixed: true,
      }
      for (const item of invoice.lineItems) {
        keys[`quantity:${item.id}`] = true
        keys[`unitPrice:${item.id}`] = true
      }
      setTouched((current) => ({ ...current, ...keys }))
      setSaveError('Fix the highlighted fields before saving.')
      return null
    }

    setSaving(true)
    setSaveError(null)
    try {
      const saved = savedId
        ? await updateInvoice(savedId, invoice, status)
        : await createInvoice(invoice, 'draft')
      setSavedId(saved.id)
      setStatus(saved.status)
      setInvoice(savedToInvoice(saved))
      return saved.id
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not save invoice.'
      setSaveError(message)
      return null
    } finally {
      setSaving(false)
    }
  }, [invoice, savedId, status])

  const loadSavedInvoice = useCallback(async (id: string) => {
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await fetchInvoice(id)
      setInvoice(savedToInvoice(saved))
      setSavedId(saved.id)
      setStatus(saved.status)
      setTouched({})
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not load invoice.'
      setSaveError(message)
      throw new Error(message, { cause: error })
    } finally {
      setSaving(false)
    }
  }, [])

  const deleteSavedDraft = useCallback(
    async (id?: string) => {
      const targetId = id ?? savedId
      if (!targetId) {
        return false
      }
      setSaving(true)
      setSaveError(null)
      try {
        await deleteInvoice(targetId)
        if (savedId === targetId) {
          await applyFreshDraft()
        }
        return true
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Could not delete invoice.'
        setSaveError(message)
        return false
      } finally {
        setSaving(false)
      }
    },
    [applyFreshDraft, savedId],
  )

  const value = useMemo(
    () => ({
      invoice,
      totals,
      errors,
      savedId,
      status,
      saving,
      saveError,
      touch,
      visibleError,
      patchInvoice,
      setStatus,
      setFromParty,
      setCustomerParty,
      patchFrom,
      patchCustomer,
      patchFromAddress,
      patchCustomerAddress,
      patchPayment,
      updateLineItem,
      addLineItem,
      removeLineItem,
      resetDraft,
      startNewInvoice,
      saveInvoice,
      loadSavedInvoice,
      deleteSavedDraft,
    }),
    [
      invoice,
      totals,
      errors,
      savedId,
      status,
      saving,
      saveError,
      touch,
      visibleError,
      patchInvoice,
      setFromParty,
      setCustomerParty,
      patchFrom,
      patchCustomer,
      patchFromAddress,
      patchCustomerAddress,
      patchPayment,
      updateLineItem,
      addLineItem,
      removeLineItem,
      resetDraft,
      startNewInvoice,
      saveInvoice,
      loadSavedInvoice,
      deleteSavedDraft,
    ],
  )

  return (
    <InvoiceDraftContext.Provider value={value}>
      {children}
    </InvoiceDraftContext.Provider>
  )
}

export function useInvoiceDraft(): InvoiceDraftContextValue {
  const context = useContext(InvoiceDraftContext)
  if (!context) {
    throw new Error('useInvoiceDraft must be used within InvoiceDraftProvider')
  }
  return context
}
