import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../../settings/SettingsContext.tsx'
import {
  currentUtcYear,
  formatInvoiceNumber,
} from '../../utils/invoiceNumbering.ts'
import { Field } from '../Field.tsx'
import { InvoiceSection } from '../InvoiceSection.tsx'

export function NumberingPanel() {
  const {
    numbering,
    loading,
    saving,
    error,
    saveNumbering,
    saveNextSequence,
  } = useSettings()
  const [prefix, setPrefix] = useState(numbering.prefix)
  const [includeYear, setIncludeYear] = useState(numbering.includeYear)
  const [separator, setSeparator] = useState(numbering.separator)
  const [padding, setPadding] = useState(String(numbering.padding))
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmingNext, setConfirmingNext] = useState(false)
  const [nextInput, setNextInput] = useState(String(numbering.nextSequence))
  const [nextError, setNextError] = useState<string | null>(null)

  useEffect(() => {
    setPrefix(numbering.prefix)
    setIncludeYear(numbering.includeYear)
    setSeparator(numbering.separator)
    setPadding(String(numbering.padding))
    setNextInput(String(numbering.nextSequence))
  }, [numbering])

  const liveExample = useMemo(() => {
    const pad = Number(padding)
    return formatInvoiceNumber(
      {
        prefix,
        includeYear,
        separator,
        padding: Number.isInteger(pad) && pad > 0 ? pad : 1,
      },
      numbering.nextSequence,
      currentUtcYear(),
    )
  }, [includeYear, numbering.nextSequence, padding, prefix, separator])

  const previewNext = useMemo(() => {
    const value = Number(nextInput)
    if (!Number.isInteger(value) || value < 1) {
      return ''
    }
    const pad = Number(padding)
    return formatInvoiceNumber(
      {
        prefix,
        includeYear,
        separator,
        padding: Number.isInteger(pad) && pad > 0 ? pad : numbering.padding,
      },
      value,
      currentUtcYear(),
    )
  }, [includeYear, nextInput, numbering.padding, padding, prefix, separator])

  async function onSaveFormat() {
    setSuccess(null)
    const pad = Number(padding)
    if (!Number.isInteger(pad) || pad < 1 || pad > 12) {
      return
    }
    try {
      await saveNumbering({
        prefix,
        includeYear,
        separator,
        padding: pad,
      })
      setSuccess('Numbering format saved. Existing invoice numbers are unchanged.')
    } catch {
      // Context error.
    }
  }

  async function onConfirmNext() {
    setNextError(null)
    const value = Number(nextInput)
    if (!Number.isInteger(value) || value < 1) {
      setNextError('Enter a whole number of at least 1.')
      return
    }
    try {
      await saveNextSequence(value)
      setConfirmingNext(false)
      setSuccess(`Next sequence is now ${value}.`)
    } catch (caught) {
      setNextError(caught instanceof Error ? caught.message : 'Could not change next number.')
    }
  }

  return (
    <>
      <InvoiceSection
        title="Invoice numbering"
        description="The Worker allocates numbers from D1. Assigned invoice numbers never change when you edit this format."
      >
        {loading ? <p className="settings-status">Loading numbering…</p> : null}
        <div className="form-grid form-grid--2">
          <Field label="Prefix" htmlFor="number-prefix">
            <input
              id="number-prefix"
              className="field__input"
              value={prefix}
              disabled={saving || loading}
              onChange={(event) => {
                setPrefix(event.target.value)
                setSuccess(null)
              }}
            />
          </Field>
          <Field label="Separator" htmlFor="number-separator">
            <input
              id="number-separator"
              className="field__input"
              value={separator}
              disabled={saving || loading}
              onChange={(event) => {
                setSeparator(event.target.value)
                setSuccess(null)
              }}
            />
          </Field>
          <Field label="Sequence padding" htmlFor="number-padding">
            <input
              id="number-padding"
              className="field__input"
              inputMode="numeric"
              value={padding}
              disabled={saving || loading}
              onChange={(event) => {
                setPadding(event.target.value)
                setSuccess(null)
              }}
            />
          </Field>
          <Field label="Include current year" htmlFor="number-year">
            <select
              id="number-year"
              className="field__select"
              value={includeYear ? 'yes' : 'no'}
              disabled={saving || loading}
              onChange={(event) => {
                setIncludeYear(event.target.value === 'yes')
                setSuccess(null)
              }}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>
        <p className="settings-help">Example of the next invoice number</p>
        <p className="settings-example">{liveExample}</p>
        <p className="settings-help">
          Year is added to the prefix with no extra separator (
          <code>BD</code> + <code>2026</code> + separator + sequence →{' '}
          <code>BD2026-0051</code>). Put a dash in the prefix for{' '}
          <code>BD-2026-0051</code>. The sequence does not reset on January 1,
          so numbers cannot collide across years.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving || loading}
            onClick={() => void onSaveFormat()}
          >
            {saving ? 'Saving…' : 'Save format'}
          </button>
          {success ? (
            <p className="settings-status settings-status--success">{success}</p>
          ) : null}
          {error ? (
            <p className="settings-status settings-status--error">{error}</p>
          ) : null}
        </div>
      </InvoiceSection>

      <InvoiceSection
        title="Next sequence"
        description="This is not a casual text field. Changing it consumes or skips numbers and is rejected if it would collide with an existing invoice."
      >
        <p className="settings-help">
          Current next number: <strong>{numbering.nextSequence}</strong>
        </p>
        {confirmingNext ? (
          <div className="form-grid form-grid--2">
            <Field label="New next number" htmlFor="next-sequence" error={nextError ?? undefined}>
              <input
                id="next-sequence"
                className="field__input"
                inputMode="numeric"
                value={nextInput}
                disabled={saving}
                onChange={(event) => {
                  setNextInput(event.target.value)
                  setNextError(null)
                }}
              />
            </Field>
            <div>
              <p className="settings-help">Resulting invoice number</p>
              <p className="settings-example">{previewNext || '—'}</p>
            </div>
            <div className="settings-actions form-grid__full">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={saving}
                onClick={() => {
                  setConfirmingNext(false)
                  setNextInput(String(numbering.nextSequence))
                  setNextError(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={saving}
                onClick={() => void onConfirmNext()}
              >
                Confirm new next number
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={saving || loading}
              onClick={() => {
                setConfirmingNext(true)
                setSuccess(null)
              }}
            >
              Change next number
            </button>
          </div>
        )}
      </InvoiceSection>
    </>
  )
}
