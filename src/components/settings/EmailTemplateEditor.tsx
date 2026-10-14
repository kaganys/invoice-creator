import { useEffect, useRef, useState } from 'react'
import {
  prepareInvoiceEmail,
  SAMPLE_EMAIL_BRAND,
  SAMPLE_EMAIL_VARS,
  type EmailBrandAssets,
} from '../../invoice/emailHtml.ts'
import {
  applyEmailTemplate,
  type TemplateVars,
} from '../../invoice/emailTemplates.ts'
import { useFocusTrap } from '../../hooks/useFocusTrap.ts'
import { EmailMessageEditor, type EmailEditorBrand } from './EmailMessageEditor.tsx'

type EmailTemplateEditorProps = {
  open: boolean
  subject: string
  html: string
  previewVars?: TemplateVars
  brand?: EmailBrandAssets & { senderName?: string }
  onClose: () => void
  onApply: (next: { subject: string; html: string }) => void
}

export function EmailTemplateEditor({
  open,
  subject,
  html,
  previewVars = SAMPLE_EMAIL_VARS,
  brand = SAMPLE_EMAIL_BRAND,
  onClose,
  onApply,
}: EmailTemplateEditorProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [draftSubject, setDraftSubject] = useState(subject)
  const [draftHtml, setDraftHtml] = useState(html)
  useFocusTrap(open, dialogRef, onClose)

  useEffect(() => {
    if (!open) {
      return
    }
    setDraftSubject(subject)
    setDraftHtml(html)
  }, [open, subject, html])

  useEffect(() => {
    if (!open) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) {
    return null
  }

  const editorBrand: EmailEditorBrand = {
    logoUrl: brand.logoUrl,
    wordmarkUrl: brand.wordmarkUrl,
    senderName: brand.senderName || previewVars.business_name,
  }
  const preview = prepareInvoiceEmail(draftHtml, previewVars, brand, {
    preheader: applyEmailTemplate(draftSubject, previewVars),
  })

  return (
    <div className="email-modal">
      <div
        ref={dialogRef}
        className="email-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-editor-title"
        tabIndex={-1}
      >
        <header className="email-modal__bar">
          <h2 id="email-editor-title">Edit email</h2>
          <div className="email-modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => onApply({ subject: draftSubject, html: draftHtml })}
            >
              Use this email
            </button>
          </div>
        </header>
        <div className="email-modal__body">
          <EmailMessageEditor
            subject={draftSubject}
            html={draftHtml}
            subjectPreview={applyEmailTemplate(draftSubject, previewVars)}
            brand={editorBrand}
            onChange={({ subject: nextSubject, html: nextHtml }) => {
              setDraftSubject(nextSubject)
              setDraftHtml(nextHtml)
            }}
          />
          <iframe
            title="Invoice email preview"
            className="settings-preview__email email-modal__preview"
            srcDoc={preview.html}
          />
        </div>
      </div>
    </div>
  )
}
