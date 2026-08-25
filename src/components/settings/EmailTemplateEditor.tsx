import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  EMAIL_VARIABLES,
  type EmailVariableId,
} from '../../invoice/emailTemplates.ts'
import {
  EMAIL_BLOCKS,
  emailVariableChip,
  type EmailBlockId,
} from '../../invoice/emailBlocks.ts'
import {
  prepareInvoiceEmail,
  SAMPLE_EMAIL_BRAND,
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

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={active ? 'email-tool is-active' : 'email-tool'}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
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
  const [textColor, setTextColor] = useState('#111111')
  const [highlight, setHighlight] = useState('#fde68a')

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

  const preview = prepareInvoiceEmail(
    editorHtml,
    SAMPLE_EMAIL_VARS,
    SAMPLE_EMAIL_BRAND,
  )

  function sync() {
    setEditorHtml(editorRef.current?.innerHTML ?? '')
  }

  function insertHtml(snippet: string) {
    editorRef.current?.focus()
    runCommand('insertHTML', snippet)
    sync()
  }

  function insertVariable(id: EmailVariableId) {
    insertHtml(`&nbsp;${emailVariableChip(id)}&nbsp;`)
  }

  function insertBlock(id: EmailBlockId) {
    insertHtml(EMAIL_BLOCKS.find((block) => block.id === id)?.html ?? '')
  }

  function format(command: string, value?: string) {
    editorRef.current?.focus()
    runCommand(command, value)
    sync()
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
            <h2 id="email-editor-title">Design invoice email</h2>
            <p>
              Click blocks onto the canvas. The live preview is the mobile-friendly
              HTML that customers receive.
            </p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <IconX />
            Close
          </button>
        </header>

        <div className="email-editor-modal__subject">
          <label className="field__label" htmlFor="email-editor-subject">
            Subject line
          </label>
          <input
            id="email-editor-subject"
            className="field__input"
            value={draftSubject}
            onChange={(event) => setDraftSubject(event.target.value)}
          />
        </div>

        <div className="email-editor-toolbar" role="toolbar" aria-label="Formatting">
          <ToolButton label="Bold" onClick={() => format('bold')}>
            <strong>B</strong>
          </ToolButton>
          <ToolButton label="Italic" onClick={() => format('italic')}>
            <em>I</em>
          </ToolButton>
          <ToolButton label="Underline" onClick={() => format('underline')}>
            <span className="email-tool__u">U</span>
          </ToolButton>
          <ToolButton label="Heading" onClick={() => format('formatBlock', 'h2')}>
            H
          </ToolButton>
          <ToolButton label="Paragraph" onClick={() => format('formatBlock', 'p')}>
            ¶
          </ToolButton>
          <ToolButton label="Bulleted list" onClick={() => format('insertUnorderedList')}>
            ••
          </ToolButton>
          <ToolButton label="Numbered list" onClick={() => format('insertOrderedList')}>
            1.
          </ToolButton>
          <span className="email-toolbar-sep" />
          <ToolButton label="Align left" onClick={() => format('justifyLeft')}>
            ⇤
          </ToolButton>
          <ToolButton label="Align center" onClick={() => format('justifyCenter')}>
            ≡
          </ToolButton>
          <ToolButton label="Align right" onClick={() => format('justifyRight')}>
            ⇥
          </ToolButton>
          <ToolButton label="Link" onClick={addLink}>
            ↗
          </ToolButton>
          <label className="email-tool email-tool--color" title="Text color">
            <span>A</span>
            <input
              type="color"
              value={textColor}
              onChange={(event) => {
                setTextColor(event.target.value)
                format('foreColor', event.target.value)
              }}
            />
          </label>
          <label className="email-tool email-tool--color" title="Highlight">
            <span>▮</span>
            <input
              type="color"
              value={highlight}
              onChange={(event) => {
                setHighlight(event.target.value)
                format('hiliteColor', event.target.value)
              }}
            />
          </label>
          <ToolButton label="Clear formatting" onClick={() => format('removeFormat')}>
            ✕
          </ToolButton>
          <ToolButton label="Undo" onClick={() => format('undo')}>
            ↺
          </ToolButton>
          <ToolButton label="Redo" onClick={() => format('redo')}>
            ↻
          </ToolButton>
        </div>

        <div className="email-editor-workspace">
          <aside className="email-editor-palette">
            <p className="email-editor-palette__title">Blocks</p>
            <div className="email-block-grid">
              {EMAIL_BLOCKS.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className={`email-block-card email-block-card--${block.id}`}
                  onClick={() => insertBlock(block.id)}
                >
                  <span className="email-block-card__preview" aria-hidden="true" />
                  <span className="email-block-card__label">{block.label}</span>
                  <span className="email-block-card__hint">{block.hint}</span>
                </button>
              ))}
            </div>
            <p className="email-editor-palette__title">Variables</p>
            <div className="email-editor-vars">
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
          </aside>

          <div className="email-editor-stage">
            <div className="email-editor-card">
              <div className="email-editor-card__chrome">Canvas</div>
              <div
                ref={editorRef}
                className="email-editor-canvas"
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label="Email body"
                onInput={sync}
              />
            </div>
          </div>

          <div className="email-editor-preview">
            <div className="email-editor-preview__bar">
              <span>Customer view</span>
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
                  Phone
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
            <div
              className={
                previewMode === 'mobile'
                  ? 'email-device is-phone'
                  : 'email-device is-desktop'
              }
            >
              {previewMode === 'mobile' ? (
                <div className="email-device__notch" aria-hidden="true" />
              ) : null}
              <iframe
                className="email-editor-preview__frame"
                title="Mobile-friendly email preview"
                srcDoc={preview.html}
              />
            </div>
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
