import { useEffect, useMemo, useState } from 'react'
import { createDefaultInvoice } from '../../data/defaultInvoice.ts'
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
import { InvoiceSection } from '../InvoiceSection.tsx'

function cloneFormat(format: InvoiceFormat): InvoiceFormat {
  return structuredClone(format)
}

function ColorField({
  id,
  label,
  value,
  allowEmpty,
  onChange,
}: {
  id: string
  label: string
  value: string
  allowEmpty?: boolean
  onChange: (value: string) => void
}) {
  const pickerValue = value && isHexColor(value) ? value : '#111111'
  return (
    <Field label={label} htmlFor={id}>
      <div className="format-color">
        <input
          id={id}
          type="color"
          className="format-color__picker"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
        />
        <input
          className="field__input"
          value={value}
          placeholder={allowEmpty ? 'inherit' : '#111111'}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
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
    <details className="format-element">
      <summary>{ELEMENT_LABELS[formatKey]}</summary>
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
        <Field label="Size (px)" htmlFor={`${formatKey}-size`}>
          <input
            id={`${formatKey}-size`}
            className="field__input"
            type="number"
            min={8}
            max={72}
            value={style.sizePx}
            onChange={(event) =>
              onChange({ ...style, sizePx: Number(event.target.value) || style.sizePx })
            }
          />
        </Field>
        <Field label="Weight" htmlFor={`${formatKey}-weight`}>
          <select
            id={`${formatKey}-weight`}
            className="field__select"
            value={style.weight}
            onChange={(event) =>
              onChange({ ...style, weight: Number(event.target.value) as FontWeight })
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
          label="Text color"
          value={style.color ?? ''}
          allowEmpty
          onChange={(value) => {
            const trimmed = value.trim()
            onChange({
              ...style,
              color: trimmed ? normalizeHex(trimmed) : null,
            })
          }}
        />
      </div>
    </details>
  )
}

export function FormatPanel() {
  const { format, saving, loading, error, saveFormat } = useSettings()
  const [draft, setDraft] = useState<InvoiceFormat>(() => cloneFormat(format))
  const [section, setSection] = useState<FormatSectionId>('global')
  const [success, setSuccess] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(cloneFormat(format))
  }, [format])

  const dirty = JSON.stringify(draft) !== JSON.stringify(format)
  const previewInvoice = useMemo(() => {
    const invoice = createDefaultInvoice()
    invoice.number = 'BD2026-0051'
    invoice.from.name = 'Bitz Designs'
    invoice.customer.name = 'Ada Lovelace'
    invoice.customer.email = 'ada@example.com'
    invoice.lineItems = [
      {
        id: invoice.lineItems[0]?.id ?? 'preview-line',
        description: 'Brand design',
        quantity: '1',
        unitPrice: '50.00',
      },
    ]
    return invoice
  }, [])

  function patchGlobal(partial: Partial<InvoiceFormat['global']>) {
    setDraft((current) => ({ ...current, global: { ...current.global, ...partial } }))
    setSuccess(null)
  }

  function patchElement(key: ElementKey, style: ElementStyle) {
    setDraft((current) => ({
      ...current,
      elements: { ...current.elements, [key]: style },
    }))
    setSuccess(null)
  }

  async function onSave() {
    if (
      !isHexColor(draft.global.primaryColor) ||
      !isHexColor(draft.global.mutedColor) ||
      !isHexColor(draft.global.accentColor) ||
      !isHexColor(draft.global.borderColor)
    ) {
      setLocalError('Global colors must be 6-digit hex values such as #111111.')
      return
    }
    setLocalError(null)
    try {
      await saveFormat(draft)
      setSuccess('Format saved. New drafts and previews use these settings.')
    } catch {
      // Context error.
    }
  }

  function onCancel() {
    setDraft(cloneFormat(format))
    setLocalError(null)
    setSuccess(null)
  }

  function onResetAll() {
    if (!window.confirm('Reset all invoice formatting to Bitz Designs defaults?')) {
      return
    }
    setDraft(defaultInvoiceFormat())
    setSuccess(null)
  }

  function onResetSection() {
    if (!window.confirm(`Reset ${FORMAT_SECTIONS.find((entry) => entry.id === section)?.label ?? 'this section'} to defaults?`)) {
      return
    }
    setDraft((current) => resetSection(current, section))
    setSuccess(null)
  }

  const currentSection = FORMAT_SECTIONS.find((entry) => entry.id === section)

  return (
    <InvoiceSection
      title="Format"
      description="Fonts and colors for the invoice document only. Admin dashboard appearance is unchanged. Saved/sent invoices keep a snapshot of the format they were issued with."
    >
      {loading ? <p className="settings-status">Loading format…</p> : null}
      {dirty ? (
        <p className="settings-status">Unsaved formatting changes. Cancel reloads the saved D1 settings.</p>
      ) : (
        <p className="settings-status">Showing saved D1 formatting.</p>
      )}

      <div className="format-layout">
        <nav className="format-subnav" aria-label="Invoice parts">
          {FORMAT_SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={
                section === entry.id
                  ? 'settings-nav__button is-active'
                  : 'settings-nav__button'
              }
              onClick={() => setSection(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="format-editor">
          {section === 'global' ? (
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
              <Field label="Primary weight" htmlFor="format-primary-weight">
                <select
                  id="format-primary-weight"
                  className="field__select"
                  value={draft.global.primaryWeight}
                  onChange={(event) =>
                    patchGlobal({
                      primaryWeight: Number(event.target.value) as FontWeight,
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
              <Field label="Secondary weight" htmlFor="format-secondary-weight">
                <select
                  id="format-secondary-weight"
                  className="field__select"
                  value={draft.global.secondaryWeight}
                  onChange={(event) =>
                    patchGlobal({
                      secondaryWeight: Number(event.target.value) as FontWeight,
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
              <Field label="Base size (px)" htmlFor="format-base-size">
                <input
                  id="format-base-size"
                  className="field__input"
                  type="number"
                  min={8}
                  max={48}
                  value={draft.global.baseSizePx}
                  onChange={(event) =>
                    patchGlobal({
                      baseSizePx: Number(event.target.value) || draft.global.baseSizePx,
                    })
                  }
                />
              </Field>
              <ColorField
                id="format-primary-color"
                label="Primary text"
                value={draft.global.primaryColor}
                onChange={(value) =>
                  patchGlobal({ primaryColor: normalizeHex(value) ?? value })
                }
              />
              <ColorField
                id="format-muted-color"
                label="Secondary / muted text"
                value={draft.global.mutedColor}
                onChange={(value) =>
                  patchGlobal({ mutedColor: normalizeHex(value) ?? value })
                }
              />
              <ColorField
                id="format-accent-color"
                label="Accent"
                value={draft.global.accentColor}
                onChange={(value) =>
                  patchGlobal({ accentColor: normalizeHex(value) ?? value })
                }
              />
              <ColorField
                id="format-border-color"
                label="Border / table lines"
                value={draft.global.borderColor}
                onChange={(value) =>
                  patchGlobal({ borderColor: normalizeHex(value) ?? value })
                }
              />
            </div>
          ) : (
            currentSection?.keys.map((key) => (
              <ElementEditor
                key={key}
                formatKey={key}
                style={draft.elements[key]}
                onChange={(style) => patchElement(key, style)}
              />
            ))
          )}
        </div>
      </div>

      <div className="format-preview" aria-label="Live invoice preview">
        <p className="settings-help">Live preview uses unsaved changes. The invoice background stays white.</p>
        <div className="format-preview__sheet">
          <InvoiceDocument invoice={previewInvoice} format={draft} />
        </div>
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || loading || !dirty}
          onClick={() => void onSave()}
        >
          {saving ? 'Saving…' : 'Save format'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={saving || !dirty}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="button" className="btn btn--ghost" onClick={onResetSection}>
          Reset section
        </button>
        <button type="button" className="btn btn--ghost" onClick={onResetAll}>
          Reset format defaults
        </button>
        {success ? (
          <p className="settings-status settings-status--success">{success}</p>
        ) : null}
        {localError || error ? (
          <p className="settings-status settings-status--error">
            {localError || error}
          </p>
        ) : null}
      </div>
    </InvoiceSection>
  )
}
