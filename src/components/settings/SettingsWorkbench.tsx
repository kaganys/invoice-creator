import type { ReactNode } from 'react'

export function SettingsWorkbench({
  form,
  preview,
  previewTitle,
  saving,
  dirty,
  success,
  error,
  onSave,
  saveLabel,
  extra,
  className,
  previewClassName,
}: {
  form: ReactNode
  preview: ReactNode
  previewTitle: string
  saving: boolean
  dirty: boolean
  success: string | null
  error: string | null
  onSave: () => void
  saveLabel: string
  extra?: ReactNode
  className?: string
  previewClassName?: string
}) {
  let status = 'No unsaved changes'
  let statusClass = 'settings-status'
  if (saving) {
    status = 'Saving…'
  } else if (error) {
    status = error
    statusClass = 'settings-status settings-status--error'
  } else if (dirty) {
    status = 'Unsaved changes'
  } else if (success) {
    status = success
    statusClass = 'settings-status settings-status--success'
  }

  return (
    <div className={className ? `settings-workbench ${className}` : 'settings-workbench'}>
      <div className="settings-workbench__form">{form}</div>
      <aside
        className={
          previewClassName
            ? `settings-workbench__preview ${previewClassName}`
            : 'settings-workbench__preview'
        }
      >
        <p className="settings-preview__label">{previewTitle}</p>
        {preview}
      </aside>
      <div className="settings-workbench__bar">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || !dirty}
          onClick={onSave}
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
        {extra}
        <p className={statusClass} role="status">
          {status}
        </p>
      </div>
    </div>
  )
}
