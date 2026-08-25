import { useEffect, useRef, useState } from 'react'
import {
  EMAIL_VARIABLES,
  emailVariableToken,
  type EmailVariableId,
} from '../../invoice/emailTemplates.ts'
import {
  prepareInvoiceEmail,
  SAMPLE_EMAIL_VARS,
} from '../../invoice/emailHtml.ts'
import { useFocusTrap } from '../../hooks/useFocusTrap.ts'
import { IconX } from '../icons.tsx'
import './EmailTemplateEditor.css'

type EmailTemplateEditorProps = {
  open: boolean
  subject: string
  html: string
  onClose: () => void
  onApply: (next: { subject: string; html: string }) => void
}

function runCommand(command: string, value?: string) {
  document.execCommand(command, false, value)
}

export function EmailTemplateEditor({
  open,
  subject,
  html,
  onClose,
  onApply,
}: EmailTemplateEditorProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [draftSubject, setDraftSubject] = useState(subject)
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')
  const [editorHtml, setEditorHtml] = useState(html)

  useFocusTrap(open, dialogRef, onClose)

  useEffect(() => {
    if (!open) {
      return
    }
    setDraftSubject(subject)
    setEditorHtml(html)
    const frame = window.requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = html || '<p></p>'
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, subject, html])

  if (!open) {
    return null
  }

  const preview = prepareInvoiceEmail(editorHtml, SAMPLE_EMAIL_VARS)

  function insertVariable(id: EmailVariableId) {
    editorRef.current?.focus()
    runCommand('insertText', emailVariableToken(id))
    setEditorHtml(editorRef.current?.innerHTML ?? '')
  }

  function format(command: string, value?: string) {
    editorRef.current?.focus()
    runCommand(command, value)
    setEditorHtml(editorRef.current?.innerHTML ?? '')
  }

  function addLink() {
    const url = window.prompt('Link URL', 'https://')
    if (!url) {
      return
    }
    format('createLink', url)
  }

  return (
    <div
      className="email-editor-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="email-editor-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-editor-title"
        tabIndex={-1}
      >
        <header className="email-editor-modal__header">
          <div>
            <h2 id="email-editor-title">Customize invoice email</h2>
            <p>
              Visual HTML email with mobile-friendly layout. Variables are replaced
              when the invoice is sent.
            </p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <IconX />
            Close
          </button>
        </header>

        <div className="email-editor-modal__subject">
          <label className="field__label" htmlFor="email-editor-subject">
            Subject
          </label>
          <input
            id="email-editor-subject"
            className="field__input"
            value={draftSubject}
            onChange={(event) => setDraftSubject(event.target.value)}
          />
        </div>

        <div className="email-editor-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" className="btn btn--ghost" onClick={() => format('bold')}>
            Bold
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => format('italic')}>
            Italic
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => format('underline')}>
            Underline
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('strikeThrough')}
          >
            Strike
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('formatBlock', 'h2')}
          >
            Heading
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('formatBlock', 'p')}
          >
            Paragraph
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('insertUnorderedList')}
          >
            Bullets
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('insertOrderedList')}
          >
            Numbers
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('justifyLeft')}
          >
            Left
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('justifyCenter')}
          >
            Center
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('justifyRight')}
          >
            Right
          </button>
          <button type="button" className="btn btn--ghost" onClick={addLink}>
            Link
          </button>
          <label className="email-editor-color">
            Color
            <input
              type="color"
              defaultValue="#111111"
              onChange={(event) => format('foreColor', event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => format('removeFormat')}
          >
            Clear
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => format('undo')}>
            Undo
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => format('redo')}>
            Redo
          </button>
        </div>

        <div className="email-editor-vars" aria-label="Insert variables">
          {EMAIL_VARIABLES.map((variable) => (
            <button
              key={variable.id}
              type="button"
              className="email-editor-var"
              onClick={() => insertVariable(variable.id)}
            >
              {variable.label}
            </button>
          ))}
        </div>

        <div className="email-editor-modal__split">
          <div
            ref={editorRef}
            className="email-editor-canvas"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="Email body"
            onInput={() => setEditorHtml(editorRef.current?.innerHTML ?? '')}
          />
          <div className="email-editor-preview">
            <div className="email-editor-preview__bar">
              <span>Preview</span>
              <div>
                <button
                  type="button"
                  className={
                    previewMode === 'mobile'
                      ? 'btn btn--ghost is-active'
                      : 'btn btn--ghost'
                  }
                  onClick={() => setPreviewMode('mobile')}
                >
                  Mobile
                </button>
                <button
                  type="button"
                  className={
                    previewMode === 'desktop'
                      ? 'btn btn--ghost is-active'
                      : 'btn btn--ghost'
                  }
                  onClick={() => setPreviewMode('desktop')}
                >
                  Desktop
                </button>
              </div>
            </div>
            <iframe
              className={
                previewMode === 'mobile'
                  ? 'email-editor-preview__frame is-mobile'
                  : 'email-editor-preview__frame'
              }
              title="Mobile-friendly email preview"
              srcDoc={preview.html}
            />
          </div>
        </div>

        <footer className="email-editor-modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              onApply({
                subject: draftSubject,
                html: editorRef.current?.innerHTML || editorHtml,
              })
            }
          >
            Use this email
          </button>
        </footer>
      </div>
    </div>
  )
}
