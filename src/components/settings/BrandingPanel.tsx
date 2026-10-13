import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { BRAND, BUILTIN_BRANDING_PATHS, type BrandingKind } from '../../branding.ts'
import { useSettings } from '../../settings/SettingsContext.tsx'
import { InvoiceDocument } from '../InvoiceDocument.tsx'
import { ScaledSheet } from './ScaledSheet.tsx'
import { previewInvoice } from './previewInvoice.ts'
import { SettingsWorkbench } from './SettingsWorkbench.tsx'
import { brandingPreviewUrl } from './settingsDraft.ts'

const SLOTS: Array<{
  kind: BrandingKind
  title: string
  hint: string
  key: 'siteWordmark' | 'siteIcon' | 'invoiceLogo'
}> = [
  {
    kind: 'site-wordmark',
    title: 'Header logo',
    hint: 'Shown in the top bar.',
    key: 'siteWordmark',
  },
  {
    kind: 'site-icon',
    title: 'Icon',
    hint: 'Sidebar and browser tab.',
    key: 'siteIcon',
  },
  {
    kind: 'invoice-logo',
    title: 'Invoice logo',
    hint: 'Printed on new invoices. Older invoices keep the logo they were saved with.',
    key: 'invoiceLogo',
  },
]

type SlotDraft = {
  file: File | null
  objectUrl: string | null
  restore: boolean
}

const EMPTY_SLOT: SlotDraft = { file: null, objectUrl: null, restore: false }

export function BrandingPanel() {
  const { branding, format, loading, saving, error, uploadAsset, restoreAsset } =
    useSettings()
  const [slots, setSlots] = useState<Record<BrandingKind, SlotDraft>>({
    'site-wordmark': EMPTY_SLOT,
    'site-icon': EMPTY_SLOT,
    'invoice-logo': EMPTY_SLOT,
  })
  const [success, setSuccess] = useState<string | null>(null)
  const slotsRef = useRef(slots)
  slotsRef.current = slots

  useEffect(() => {
    return () => {
      for (const slot of Object.values(slotsRef.current)) {
        if (slot.objectUrl) {
          URL.revokeObjectURL(slot.objectUrl)
        }
      }
    }
  }, [])

  function previewFor(kind: BrandingKind, key: (typeof SLOTS)[number]['key']) {
    const current = branding[key]
    return brandingPreviewUrl({
      savedUrl: current.url || current.path || BRAND.icon,
      builtinUrl: BUILTIN_BRANDING_PATHS[kind],
      pendingObjectUrl: slots[kind].objectUrl,
      restore: slots[kind].restore,
    })
  }

  const dirty = SLOTS.some(
    (slot) => slots[slot.kind].file !== null || slots[slot.kind].restore,
  )

  function chooseFile(kind: BrandingKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setSuccess(null)
    setSlots((current) => {
      const previous = current[kind].objectUrl
      if (previous) {
        URL.revokeObjectURL(previous)
      }
      return {
        ...current,
        [kind]: {
          file,
          objectUrl: URL.createObjectURL(file),
          restore: false,
        },
      }
    })
  }

  function useBuiltin(kind: BrandingKind) {
    setSuccess(null)
    setSlots((current) => {
      const previous = current[kind].objectUrl
      if (previous) {
        URL.revokeObjectURL(previous)
      }
      return {
        ...current,
        [kind]: { file: null, objectUrl: null, restore: true },
      }
    })
  }

  async function onSave() {
    setSuccess(null)
    try {
      for (const slot of SLOTS) {
        const pending = slots[slot.kind]
        if (pending.file) {
          await uploadAsset(slot.kind, pending.file)
        } else if (pending.restore) {
          await restoreAsset(slot.kind)
        }
      }
      setSlots((current) => {
        for (const slot of Object.values(current)) {
          if (slot.objectUrl) {
            URL.revokeObjectURL(slot.objectUrl)
          }
        }
        return {
          'site-wordmark': EMPTY_SLOT,
          'site-icon': EMPTY_SLOT,
          'invoice-logo': EMPTY_SLOT,
        }
      })
      setSuccess('Branding saved.')
    } catch {
      // The settings context stores the error.
    }
  }

  const invoiceLogo = previewFor('invoice-logo', 'invoiceLogo')
  const sample = useMemo(() => previewInvoice(invoiceLogo), [invoiceLogo])

  return (
    <SettingsWorkbench
      previewTitle="Invoice preview"
        saving={saving}
        dirty={dirty}
        success={success}
        error={error}
      onSave={() => void onSave()}
      saveLabel="Save branding"
      form={
        <fieldset className="settings-group" disabled={saving || loading}>
          <legend>Logos</legend>
          <p className="settings-help">
            PNG, JPEG, or WebP, 2 MB or smaller. Choose the files, then save.
          </p>
          {SLOTS.map((slot) => {
            const current = branding[slot.key]
            const src = previewFor(slot.kind, slot.key)
            const usingBuiltin =
              slots[slot.kind].restore ||
              (current.isDefault && !slots[slot.kind].file)
            return (
              <div key={slot.kind} className="logo-slot">
                <label className="logo-slot__well">
                  <img src={src} alt="" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="visually-hidden"
                    onChange={(event) => chooseFile(slot.kind, event)}
                  />
                </label>
                <div className="logo-slot__copy">
                  <h3>{slot.title}</h3>
                  <p className="settings-help">{slot.hint}</p>
                  <p className="settings-help">
                    {slots[slot.kind].file
                      ? slots[slot.kind].file?.name
                      : usingBuiltin
                        ? 'Built-in image'
                        : 'Uploaded image'}
                  </p>
                  <button
                    type="button"
                    className="btn btn--ghost logo-slot__builtin"
                    disabled={usingBuiltin && !slots[slot.kind].file}
                    onClick={() => useBuiltin(slot.kind)}
                  >
                    Use built-in image
                  </button>
                </div>
              </div>
            )
          })}
        </fieldset>
      }
      preview={
        <div className="settings-preview__stack">
          <div className="settings-preview__chrome">
            <img src={previewFor('site-wordmark', 'siteWordmark')} alt="" />
            <img src={previewFor('site-icon', 'siteIcon')} alt="" />
          </div>
          <ScaledSheet>
            <InvoiceDocument
              invoice={sample}
              format={format}
              logoUrl={invoiceLogo}
            />
          </ScaledSheet>
        </div>
      }
    />
  )
}
