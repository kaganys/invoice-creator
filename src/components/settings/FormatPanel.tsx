import { useEffect, useMemo, useState } from 'react'
import {
  defaultInvoiceFormat,
  ELEMENT_LABELS,
  FONT_IDS,
  FONT_LABELS,
  FONT_WEIGHTS,
  FORMAT_SECTIONS,
  isHexColor,
  normalizeHex,
  resetSection,
  type ElementKey,
  type ElementStyle,
  type FontId,
  type FontSource,
  type FontWeight,
  type FormatSectionId,
  type InvoiceFormat,
} from '../../invoice/format.ts'
import { useSettings } from '../../settings/SettingsContext.tsx'
import { InvoiceDocument } from '../InvoiceDocument.tsx'
import { Field } from '../Field.tsx'
import { previewInvoice } from './previewInvoice.ts'
import { ScaledSheet } from './ScaledSheet.tsx'
import { SettingsWorkbench } from './SettingsWorkbench.tsx'

const PARTS: Array<{ id: FormatSectionId; label: string }> = [
  { id: 'header', label: 'Heading' },
  { id: 'metadata', label: 'Number and dates' },
  { id: 'from', label: 'From' },
  { id: 'billTo', label: 'Bill to' },
  { id: 'amountDue', label: 'Amount due' },
  { id: 'memo', label: 'Payment memo' },
  { id: 'lineItems', label: 'Line items' },
  { id: 'totals', label: 'Totals' },
  { id: 'notes', label: 'Notes and footer' },
]

function cloneFormat(format: InvoiceFormat): InvoiceFormat {
  return structuredClone(format)
}

function ColorField({
  id,
  label,
  hint,
  value,
  allowEmpty,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  value: string
  allowEmpty?: boolean
  onChange: (value: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => {
    setText(value)
  }, [value])
  const pickerValue = isHexColor(text)
    ? text
    : isHexColor(value)
      ? value
      : '#111111'
  return (
    <Field label={label} htmlFor={id}>
      <div className="format-color">
        <input
          type="color"
          className="format-color__picker"
          value={pickerValue}
          aria-label={`${label} swatch`}
          onChange={(event) => {
            const next = event.target.value.toLowerCase()
            setText(next)
            onChange(next)
          }}
        />
        <input
          id={id}
          className="field__input"
          value={text}
          placeholder={allowEmpty ? 'Default' : '#111111'}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            const trimmed = next.trim()
            if (!trimmed && allowEmpty) {
              onChange('')
              return
            }
            const normalized = normalizeHex(trimmed)
            if (normalized) {
              onChange(normalized)
            }
          }}
        />
      </div>
      {hint ? <p className="settings-help">{hint}</p> : null}
    </Field>
  )
}

function ElementEditor({
  formatKey,
  style,
  onChange,
}: {
  formatKey: ElementKey
  style: ElementStyle
  onChange: (next: ElementStyle) => void
}) {
  return (
    <div className="format-element">
      <h3>{ELEMENT_LABELS[formatKey]}</h3>
      <div className="form-grid form-grid--2">
        <Field label="Font" htmlFor={`${formatKey}-font`}>
          <select
            id={`${formatKey}-font`}
            className="field__select"
            value={style.font}
            onChange={(event) =>
              onChange({ ...style, font: event.target.value as FontSource })
            }
          >
            <option value="primary">Primary font</option>
            <option value="secondary">Secondary font</option>
            {FONT_IDS.map((id) => (
              <option key={id} value={id}>
                {FONT_LABELS[id]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size" htmlFor={`${formatKey}-size`}>
          <input
            id={`${formatKey}-size`}
            className="field__input"
            type="number"
            min={8}
            max={72}
            value={style.sizePx}
            onChange={(event) =>
              onChange({
                ...style,
                sizePx: Number(event.target.value) || style.sizePx,
              })
            }
          />
        </Field>
        <Field label="Weight" htmlFor={`${formatKey}-weight`}>
          <select
            id={`${formatKey}-weight`}
            className="field__select"
            value={style.weight}
            onChange={(event) =>
              onChange({
                ...style,
                weight: Number(event.target.value) as FontWeight,
              })
            }
          >
            {FONT_WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </Field>
        <ColorField
          id={`${formatKey}-color`}
          label="Color"
          value={style.color ?? ''}
          allowEmpty
          onChange={(value) => {
            const trimmed = value.trim()
            onChange({
              ...style,
              color: trimmed ? normalizeHex(trimmed) ?? style.color : null,
            })
          }}
        />
      </div>
    </div>
  )
}

export function FormatPanel() {
  const { format, branding, saving, loading, error, saveFormat } = useSettings()
  const [draft, setDraft] = useState<InvoiceFormat>(() => cloneFormat(format))
  const [part, setPart] = useState<FormatSectionId | ''>('')
  const [success, setSuccess] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(cloneFormat(format))
  }, [format])

  const dirty = JSON.stringify(draft) !== JSON.stringify(format)
  const sample = useMemo(
    () => previewInvoice(branding.invoiceLogo.url || branding.invoiceLogo.path),
    [branding.invoiceLogo.url, branding.invoiceLogo.path],
  )
  const currentPart = FORMAT_SECTIONS.find((entry) => entry.id === part)

  function patchGlobal(partial: Partial<InvoiceFormat['global']>) {
    setDraft((current) => ({
      ...current,
      global: { ...current.global, ...partial },
    }))
    setSuccess(null)
    setLocalError(null)
  }

  function patchElement(key: ElementKey, style: ElementStyle) {
    setDraft((current) => ({
      ...current,
      elements: { ...current.elements, [key]: style },
    }))
    setSuccess(null)
    setLocalError(null)
  }

  async function onSave() {
    if (
      !isHexColor(draft.global.primaryColor) ||
      !isHexColor(draft.global.mutedColor) ||
      !isHexColor(draft.global.accentColor) ||
      !isHexColor(draft.global.borderColor)
    ) {
      setLocalError('Colors need a 6-digit hex value, such as #111111.')
      return
    }
    setLocalError(null)
    try {
      await saveFormat(draft)
      setSuccess('Format saved. New invoices use it. Older ones keep their own.')
    } catch {
      // The settings context stores the error.
    }
  }

  function onResetAll() {
    if (!window.confirm('Reset invoice formatting to the built-in defaults?')) {
      return
    }
    setDraft(defaultInvoiceFormat())
    setSuccess(null)
    setLocalError(null)
  }

  function onResetPart() {
    if (!part) {
      return
    }
    const label = PARTS.find((entry) => entry.id === part)?.label ?? 'this part'
    if (!window.confirm(`Reset ${label} to the built-in defaults?`)) {
      return
    }
    setDraft((current) => resetSection(current, part))
    setSuccess(null)
    setLocalError(null)
  }

  return (
    <SettingsWorkbench
      previewTitle="Invoice preview"
      saving={saving}
      dirty={dirty}
      success={success}
      error={localError || error}
      onSave={() => void onSave()}
      saveLabel="Save format"
      extra={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={saving || !dirty}
            onClick={() => {
              setDraft(cloneFormat(format))
              setLocalError(null)
              setSuccess(null)
            }}
          >
            Discard
          </button>
          <button type="button" className="btn btn--ghost" onClick={onResetAll}>
            Reset all
          </button>
        </>
      }
      form={
        <>
          <fieldset className="settings-group" disabled={saving || loading}>
            <legend>Type</legend>
            <p className="settings-help">
              Primary is the body. Secondary is used for the invoice title.
            </p>
            <div className="form-grid form-grid--2">
              <Field label="Primary font" htmlFor="format-primary-font">
                <select
                  id="format-primary-font"
                  className="field__select"
                  value={draft.global.primaryFont}
                  onChange={(event) =>
                    patchGlobal({ primaryFont: event.target.value as FontId })
                  }
                >
                  {FONT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {FONT_LABELS[id]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Secondary font" htmlFor="format-secondary-font">
                <select
                  id="format-secondary-font"
                  className="field__select"
                  value={draft.global.secondaryFont}
                  onChange={(event) =>
                    patchGlobal({ secondaryFont: event.target.value as FontId })
                  }
                >
                  {FONT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {FONT_LABELS[id]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Body size" htmlFor="format-base-size">
                <input
                  id="format-base-size"
                  className="field__input"
                  type="number"
                  min={8}
                  max={48}
                  value={draft.global.baseSizePx}
                  onChange={(event) =>
                    patchGlobal({
                      baseSizePx:
                        Number(event.target.value) || draft.global.baseSizePx,
                    })
                  }
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="settings-group" disabled={saving || loading}>
            <legend>Colors</legend>
            <div className="form-grid form-grid--2">
              <ColorField
                id="format-primary-color"
                label="Text"
                value={draft.global.primaryColor}
                onChange={(value) =>
                  patchGlobal({ primaryColor: normalizeHex(value) ?? value })
                }
              />
              <ColorField
                id="format-muted-color"
                label="Muted text"
                value={draft.global.mutedColor}
                onChange={(value) =>
                  patchGlobal({ mutedColor: normalizeHex(value) ?? value })
                }
              />
              <ColorField
                id="format-accent-color"
                label="Accent"
                hint="Pay link and small highlights."
                value={draft.global.accentColor}
                onChange={(value) =>
                  patchGlobal({ accentColor: normalizeHex(value) ?? value })
                }
              />
              <ColorField
                id="format-border-color"
                label="Lines"
                value={draft.global.borderColor}
                onChange={(value) =>
                  patchGlobal({ borderColor: normalizeHex(value) ?? value })
                }
              />
            </div>
          </fieldset>

          <fieldset className="settings-group" disabled={saving || loading}>
            <legend>One part</legend>
            <p className="settings-help">
              Most invoices only need the fonts and colors above.
            </p>
            <Field label="Adjust" htmlFor="format-part">
              <select
                id="format-part"
                className="field__select"
                value={part}
                onChange={(event) =>
                  setPart(event.target.value as FormatSectionId | '')
                }
              >
                <option value="">Nothing else</option>
                {PARTS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            {currentPart?.keys.map((key) => (
              <ElementEditor
                key={key}
                formatKey={key}
                style={draft.elements[key]}
                onChange={(style) => patchElement(key, style)}
              />
            ))}
            {part ? (
              <div className="settings-actions">
                <button type="button" className="btn btn--ghost" onClick={onResetPart}>
                  Reset this part
                </button>
              </div>
            ) : null}
          </fieldset>
        </>
      }
      preview={
        <ScaledSheet>
          <InvoiceDocument invoice={sample} format={draft} />
        </ScaledSheet>
      }
    />
  )
}
