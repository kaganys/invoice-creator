import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  allocateInvoiceNumber,
  changeNextSequence,
  fetchAppSettings,
  restoreBrandingAsset,
  updateDefaults,
  updateNumbering,
  updateFormat,
  updatePayments,
  updateSmtp,
  uploadBrandingAsset,
} from '../api/settings.ts'
import { ApiError } from '../api/http.ts'
import { BRAND, type BrandingKind } from '../branding.ts'
import { useDirectory } from '../directory/DirectoryContext.tsx'
import type { InvoiceLogoSnapshot } from '../types/invoice.ts'
import { defaultEmailTemplates } from '../invoice/emailTemplates.ts'
import { defaultInvoiceFormat, type InvoiceFormat } from '../invoice/format.ts'
import type {
  AppSettingsPayload,
  BrandingSettingsPayload,
  InvoiceDefaultsPayload,
  NumberingSettingsPayload,
  PaymentsSettingsPayload,
  SmtpSettingsPayload,
} from '../types/settings.ts'
import {
  BUILTIN_INVOICE_DEFAULTS,
  centsToFeeInput,
  percentScaledToInput,
} from '../utils/invoiceDefaults.ts'
import { DEFAULT_NUMBERING, formatInvoiceNumber, currentUtcYear } from '../utils/invoiceNumbering.ts'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

const builtinAsset = (
  kind: BrandingKind,
  path: string,
): BrandingSettingsPayload['siteWordmark'] => ({
  kind,
  path,
  url: path,
  isDefault: true,
})

export const FALLBACK_SETTINGS: AppSettingsPayload = {
  defaultFromId: null,
  defaults: {
    defaultFromId: null,
    zelleEmail: BUILTIN_INVOICE_DEFAULTS.zelleEmail,
    cardFeePercent: percentScaledToInput(
      BUILTIN_INVOICE_DEFAULTS.cardFeePercentScaled,
    ),
    cardFeeFixed: centsToFeeInput(BUILTIN_INVOICE_DEFAULTS.cardFeeFixedCents),
    currency: BUILTIN_INVOICE_DEFAULTS.currency,
    paymentMemo: BUILTIN_INVOICE_DEFAULTS.paymentMemo,
    dueDays: BUILTIN_INVOICE_DEFAULTS.dueDays,
    notes: BUILTIN_INVOICE_DEFAULTS.notes,
    country: BUILTIN_INVOICE_DEFAULTS.country,
  },
  numbering: {
    ...DEFAULT_NUMBERING,
    nextSequence: 1,
    example: formatInvoiceNumber(DEFAULT_NUMBERING, 1, currentUtcYear()),
  },
  branding: {
    siteWordmark: builtinAsset('site-wordmark', BRAND.wordmark),
    siteIcon: builtinAsset('site-icon', BRAND.icon),
    invoiceLogo: builtinAsset('invoice-logo', BRAND.icon),
  },
  smtp: {
    host: '',
    port: 587,
    username: '',
    security: 'starttls',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    subjectTemplate: defaultEmailTemplates().subject,
    bodyTemplate: defaultEmailTemplates().body,
    passwordConfigured: false,
  },
  format: defaultInvoiceFormat(),
  payments: {
    stripeEnabled: false,
    cardPaymentsEnabled: false,
    achPaymentsEnabled: false,
    publishableKey: '',
    statementDescriptor: 'BITZ DESIGNS',
    secretConfigured: false,
  },
}

type SettingsContextValue = {
  settings: AppSettingsPayload
  defaults: InvoiceDefaultsPayload
  numbering: NumberingSettingsPayload
  branding: BrandingSettingsPayload
  smtp: SmtpSettingsPayload
  format: InvoiceFormat
  payments: PaymentsSettingsPayload
  loading: boolean
  saving: boolean
  error: string | null
  refresh: () => Promise<void>
  saveDefaults: (payload: InvoiceDefaultsPayload) => Promise<void>
  saveNumbering: (
    payload: Pick<
      NumberingSettingsPayload,
      'prefix' | 'includeYear' | 'separator' | 'padding'
    >,
  ) => Promise<void>
  saveNextSequence: (nextSequence: number) => Promise<void>
  saveSmtp: (
    payload: Omit<SmtpSettingsPayload, 'passwordConfigured' | 'passwordSource'> & {
      password?: string
      clearPassword?: boolean
    },
  ) => Promise<void>
  saveFormat: (payload: InvoiceFormat) => Promise<void>
  savePayments: (
    payload: Omit<
      PaymentsSettingsPayload,
      'secretConfigured' | 'webhookSecretConfigured' | 'secretSource'
    > & {
      secretKey?: string
      webhookSecret?: string
      clearSecret?: boolean
      clearWebhookSecret?: boolean
    },
  ) => Promise<void>
  uploadAsset: (kind: BrandingKind, file: File) => Promise<void>
  restoreAsset: (kind: BrandingKind) => Promise<void>
  allocateNumber: () => Promise<string>
  currentInvoiceLogo: InvoiceLogoSnapshot
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { refresh: refreshDirectory } = useDirectory()
  const [settings, setSettings] = useState<AppSettingsPayload>(FALLBACK_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const payload = await fetchAppSettings()
    setSettings({
      defaultFromId: payload.defaultFromId ?? payload.defaults?.defaultFromId ?? null,
      defaults: {
        ...FALLBACK_SETTINGS.defaults,
        ...payload.defaults,
        defaultFromId:
          payload.defaults?.defaultFromId ?? payload.defaultFromId ?? null,
        zelleEmail:
          payload.defaults?.zelleEmail || FALLBACK_SETTINGS.defaults.zelleEmail,
        currency:
          payload.defaults?.currency || FALLBACK_SETTINGS.defaults.currency,
        paymentMemo:
          typeof payload.defaults?.paymentMemo === 'string' &&
          payload.defaults.paymentMemo.trim()
            ? payload.defaults.paymentMemo
            : FALLBACK_SETTINGS.defaults.paymentMemo,
        dueDays:
          typeof payload.defaults?.dueDays === 'number'
            ? payload.defaults.dueDays
            : FALLBACK_SETTINGS.defaults.dueDays,
      },
      numbering: { ...FALLBACK_SETTINGS.numbering, ...payload.numbering },
      branding: {
        siteWordmark:
          payload.branding?.siteWordmark ?? FALLBACK_SETTINGS.branding.siteWordmark,
        siteIcon: payload.branding?.siteIcon ?? FALLBACK_SETTINGS.branding.siteIcon,
        invoiceLogo:
          payload.branding?.invoiceLogo ?? FALLBACK_SETTINGS.branding.invoiceLogo,
      },
      smtp: { ...FALLBACK_SETTINGS.smtp, ...payload.smtp },
      format: payload.format ?? FALLBACK_SETTINGS.format,
      payments: { ...FALLBACK_SETTINGS.payments, ...payload.payments },
    })
  }, [])

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
          setError(errorMessage(caught))
          setSettings(FALLBACK_SETTINGS)
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

  const runMutation = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setSaving(true)
    setError(null)
    try {
      return await action()
    } catch (caught) {
      const message = errorMessage(caught)
      setError(message)
      throw new Error(message, { cause: caught })
    } finally {
      setSaving(false)
    }
  }, [])

  const saveDefaults = useCallback(
    (payload: InvoiceDefaultsPayload) =>
      runMutation(async () => {
        const result = await updateDefaults(payload)
        setSettings((current) => ({
          ...current,
          defaultFromId: result.defaultFromId,
          defaults: result.defaults,
        }))
        await refreshDirectory()
      }),
    [refreshDirectory, runMutation],
  )

  const saveNumbering = useCallback(
    (
      payload: Pick<
        NumberingSettingsPayload,
        'prefix' | 'includeYear' | 'separator' | 'padding'
      >,
    ) =>
      runMutation(async () => {
        const result = await updateNumbering(payload)
        setSettings((current) => ({
          ...current,
          numbering: result.numbering,
        }))
      }),
    [runMutation],
  )

  const saveNextSequence = useCallback(
    (nextSequence: number) =>
      runMutation(async () => {
        const result = await changeNextSequence(nextSequence)
        setSettings((current) => ({
          ...current,
          numbering: result.numbering,
        }))
      }),
    [runMutation],
  )

  const saveSmtp = useCallback(
    (
      payload: Omit<SmtpSettingsPayload, 'passwordConfigured' | 'passwordSource'> & {
        password?: string
        clearPassword?: boolean
      },
    ) =>
      runMutation(async () => {
        const result = await updateSmtp(payload)
        setSettings((current) => ({
          ...current,
          smtp: result.smtp,
        }))
      }),
    [runMutation],
  )

  const savePayments = useCallback(
    (
      payload: Omit<
        PaymentsSettingsPayload,
        'secretConfigured' | 'webhookSecretConfigured' | 'secretSource'
      > & {
        secretKey?: string
        webhookSecret?: string
        clearSecret?: boolean
        clearWebhookSecret?: boolean
      },
    ) =>
      runMutation(async () => {
        const result = await updatePayments(payload)
        setSettings((current) => ({
          ...current,
          payments: result.payments,
        }))
      }),
    [runMutation],
  )

  const saveFormat = useCallback(
    (payload: InvoiceFormat) =>
      runMutation(async () => {
        const result = await updateFormat(payload)
        setSettings((current) => ({
          ...current,
          format: result.format,
        }))
      }),
    [runMutation],
  )

  const uploadAsset = useCallback(
    (kind: BrandingKind, file: File) =>
      runMutation(async () => {
        const result = await uploadBrandingAsset(kind, file)
        setSettings((current) => ({
          ...current,
          branding: result.branding,
        }))
      }),
    [runMutation],
  )

  const restoreAsset = useCallback(
    (kind: BrandingKind) =>
      runMutation(async () => {
        const result = await restoreBrandingAsset(kind)
        setSettings((current) => ({
          ...current,
          branding: result.branding,
        }))
      }),
    [runMutation],
  )

  const allocateNumber = useCallback(async () => {
    const result = await allocateInvoiceNumber()
    setSettings((current) => ({
      ...current,
      numbering: {
        ...current.numbering,
        nextSequence: result.sequence + 1,
        example: formatInvoiceNumber(
          {
            prefix: current.numbering.prefix,
            includeYear: current.numbering.includeYear,
            separator: current.numbering.separator,
            padding: current.numbering.padding,
          },
          result.sequence + 1,
          currentUtcYear(),
        ),
      },
    }))
    return result.number
  }, [])

  const currentInvoiceLogo = useMemo<InvoiceLogoSnapshot>(
    () => ({
      path: settings.branding.invoiceLogo.path || BRAND.icon,
    }),
    [settings.branding.invoiceLogo],
  )

  const value = useMemo(
    () => ({
      settings,
      defaults: settings.defaults,
      numbering: settings.numbering,
      branding: settings.branding,
      smtp: settings.smtp,
      format: settings.format,
      payments: settings.payments,
      loading,
      saving,
      error,
      refresh,
      saveDefaults,
      saveNumbering,
      saveNextSequence,
      saveSmtp,
      saveFormat,
      savePayments,
      uploadAsset,
      restoreAsset,
      allocateNumber,
      currentInvoiceLogo,
    }),
    [
      settings,
      loading,
      saving,
      error,
      refresh,
      saveDefaults,
      saveNumbering,
      saveNextSequence,
      saveSmtp,
      saveFormat,
      savePayments,
      uploadAsset,
      restoreAsset,
      allocateNumber,
      currentInvoiceLogo,
    ],
  )

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}
