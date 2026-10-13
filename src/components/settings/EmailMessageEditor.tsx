import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  EMAIL_SECTION_IDS,
  editorHtmlToSubject,
  editorHtmlToTemplate,
  emailSectionLabel,
  readEmailDocument,
  subjectToEditorHtml,
  templateToEditorHtml,
  variableChipHtml,
  writeEmailDocument,
  type EmailSectionId,
} from '../../invoice/emailCompose.ts'
import {
  EMAIL_VARIABLES,
  defaultEmailTemplates,
  type EmailVariableId,
} from '../../invoice/emailTemplates.ts'

type Snapshot = {
  subject: string
  bodyHtml: string
  sections: Record<EmailSectionId, boolean>
}

function sameSections(
  left: Record<EmailSectionId, boolean>,
  right: Record<EmailSectionId, boolean>,
) {
  return EMAIL_SECTION_IDS.every((id) => left[id] === right[id])
}

function preventFocusLoss(event: { preventDefault: () => void }) {
  event.preventDefault()
}

export function EmailMessageEditor({
  subject,
  html,
  subjectPreview,
  disabled,
  onChange,
}: {
  subject: string
  html: string
  subjectPreview: string
  disabled?: boolean
  onChange: (next: { subject: string; html: string }) => void
}) {
  const subjectRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const activeField = useRef<'subject' | 'body'>('body')
  const emitted = useRef('')
  const history = useRef<Snapshot[]>([])
  const index = useRef(0)
  const skipHistory = useRef(false)
  const [sections, setSections] = useState<Record<EmailSectionId, boolean>>(
    () => readEmailDocument(html).sections,
  )
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  function rememberSelection(field: 'subject' | 'body') {
    activeField.current = field
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return
    }
    const range = selection.getRangeAt(0)
    const root = field === 'subject' ? subjectRef.current : bodyRef.current
    if (root && root.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange()
    }
  }

  function paint(nextSubject: string, nextHtml: string) {
    const parsed = readEmailDocument(nextHtml)
    setSections(parsed.sections)
    if (subjectRef.current) {
      subjectRef.current.innerHTML = subjectToEditorHtml(nextSubject)
    }
    if (bodyRef.current) {
      bodyRef.current.innerHTML = templateToEditorHtml(parsed.proseHtml)
    }
    return parsed.sections
  }

  function publish(
    nextSubject: string,
    nextHtml: string,
    snapshot: Snapshot,
    recordHistory: boolean,
  ) {
    const key = `${nextSubject}\n${nextHtml}`
    emitted.current = key
    if (recordHistory && !skipHistory.current) {
      const stack = history.current.slice(0, index.current + 1)
      const previous = stack[stack.length - 1]
      const changed =
        !previous ||
        previous.subject !== snapshot.subject ||
        previous.bodyHtml !== snapshot.bodyHtml ||
        !sameSections(previous.sections, snapshot.sections)
      if (changed) {
        stack.push(snapshot)
        if (stack.length > 100) {
          stack.shift()
        }
        history.current = stack
        index.current = stack.length - 1
      }
    }
    setCanUndo(index.current > 0)
    setCanRedo(index.current < history.current.length - 1)
    onChange({ subject: nextSubject, html: nextHtml })
  }

  function capture(nextSections: Record<EmailSectionId, boolean>): Snapshot {
    return {
      subject: editorHtmlToSubject(subjectRef.current?.innerHTML ?? ''),
      bodyHtml: bodyRef.current?.innerHTML ?? '',
      sections: { ...nextSections },
    }
  }

  function commit(nextSections = sections, recordHistory = true) {
    const snapshot = capture(nextSections)
    const nextSubject = snapshot.subject
    const nextHtml = editorHtmlToTemplate(snapshot.bodyHtml, nextSections)
    const normalized = readEmailDocument(nextHtml)
    if (!sameSections(nextSections, normalized.sections)) {
      setSections(normalized.sections)
      if (bodyRef.current) {
        bodyRef.current.innerHTML = templateToEditorHtml(normalized.proseHtml)
      }
      snapshot.bodyHtml = bodyRef.current?.innerHTML ?? snapshot.bodyHtml
      snapshot.sections = { ...normalized.sections }
    }
    publish(nextSubject, writeEmailDocument(normalized), snapshot, recordHistory)
  }

  useEffect(() => {
    const key = `${subject}\n${html}`
    if (key === emitted.current) {
      return
    }
    const canonical = writeEmailDocument(readEmailDocument(html))
    const painted = paint(subject, canonical)
    history.current = [capture(painted)]
    index.current = 0
    setCanUndo(false)
    setCanRedo(false)
    emitted.current = `${subject}\n${canonical}`
    if (canonical !== html) {
      onChange({ subject, html: canonical })
    }
  }, [subject, html, onChange])

  function restore(snapshot: Snapshot) {
    skipHistory.current = true
    setSections(snapshot.sections)
    if (subjectRef.current) {
      subjectRef.current.innerHTML = snapshot.subject
        ? subjectToEditorHtml(snapshot.subject)
        : ''
    }
    if (bodyRef.current) {
      bodyRef.current.innerHTML = snapshot.bodyHtml
    }
    const nextSubject = editorHtmlToSubject(subjectRef.current?.innerHTML ?? '')
    const nextHtml = editorHtmlToTemplate(snapshot.bodyHtml, snapshot.sections)
    publish(nextSubject, nextHtml, snapshot, false)
    skipHistory.current = false
    setCanUndo(index.current > 0)
    setCanRedo(index.current < history.current.length - 1)
  }

  function undo() {
    if (index.current <= 0) {
      return
    }
    index.current -= 1
    restore(history.current[index.current])
  }

  function redo() {
    if (index.current >= history.current.length - 1) {
      return
    }
    index.current += 1
    restore(history.current[index.current])
  }

  function onEditorKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
    field: 'subject' | 'body',
  ) {
    const meta = event.metaKey || event.ctrlKey
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        redo()
      } else {
        undo()
      }
      return
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      redo()
      return
    }
    if (field === 'subject' && event.key === 'Enter') {
      event.preventDefault()
    }
  }

  function runCommand(command: string, value?: string) {
    bodyRef.current?.focus()
    document.execCommand(command, false, value)
    commit()
  }

  function insertVariable(id: EmailVariableId) {
    const root = activeField.current === 'subject' ? subjectRef.current : bodyRef.current
    root?.focus()
    const selection = window.getSelection()
    if (savedRange.current && selection) {
      selection.removeAllRanges()
      selection.addRange(savedRange.current)
    }
    document.execCommand('insertHTML', false, variableChipHtml(id))
    commit()
  }

  function applyLink() {
    const url = linkUrl.trim()
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
      setLinkError('Use a full link, such as https://…')
      return
    }
    setLinkError(null)
    setLinkOpen(false)
    runCommand('createLink', url)
  }

  function toggleSection(id: EmailSectionId, enabled: boolean) {
    const next = { ...sections, [id]: enabled }
    setSections(next)
    commit(next)
  }

  function resetTemplate() {
    const defaults = defaultEmailTemplates()
    paint(defaults.subject, defaults.body)
    commit(readEmailDocument(defaults.body).sections)
  }

  return (
    <div className="email-editor">
      <div className="email-editor__subject">
        <label className="field__label" htmlFor="email-subject">
          Subject
        </label>
        <div
          id="email-subject"
          ref={subjectRef}
          className="email-editor__subject-line"
          contentEditable={!disabled}
          role="textbox"
          aria-multiline="false"
          aria-label="Subject"
          spellCheck
          suppressContentEditableWarning
          onFocus={() => rememberSelection('subject')}
          onMouseUp={() => rememberSelection('subject')}
          onKeyUp={() => rememberSelection('subject')}
          onKeyDown={(event) => onEditorKeyDown(event, 'subject')}
          onInput={() => commit()}
        />
        <p className="settings-help">Reads as: {subjectPreview}</p>
      </div>

      <div className="email-editor__toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" className="email-editor__tool" disabled={disabled} onMouseDown={preventFocusLoss} onClick={() => runCommand('bold')}>
          Bold
        </button>
        <button type="button" className="email-editor__tool" disabled={disabled} onMouseDown={preventFocusLoss} onClick={() => runCommand('italic')}>
          Italic
        </button>
        <button
          type="button"
          className="email-editor__tool"
          disabled={disabled}
          onMouseDown={preventFocusLoss}
          onClick={() => {
            setLinkOpen((open) => !open)
            setLinkError(null)
          }}
        >
          Link
        </button>
        <button type="button" className="email-editor__tool" disabled={disabled} onMouseDown={preventFocusLoss} onClick={() => runCommand('insertUnorderedList')}>
          List
        </button>
        <button type="button" className="email-editor__tool" disabled={disabled} onMouseDown={preventFocusLoss} onClick={() => runCommand('insertOrderedList')}>
          Numbered
        </button>
        <button type="button" className="email-editor__tool" disabled={disabled} onMouseDown={preventFocusLoss} onClick={() => runCommand('justifyLeft')}>
          Left
        </button>
        <button type="button" className="email-editor__tool" disabled={disabled} onMouseDown={preventFocusLoss} onClick={() => runCommand('justifyCenter')}>
          Center
        </button>
        <button type="button" className="email-editor__tool" disabled={disabled} onMouseDown={preventFocusLoss} onClick={() => runCommand('justifyRight')}>
          Right
        </button>
        <span className="email-editor__tool-gap" />
        <button type="button" className="email-editor__tool" disabled={disabled || !canUndo} onMouseDown={preventFocusLoss} onClick={undo}>
          Undo
        </button>
        <button type="button" className="email-editor__tool" disabled={disabled || !canRedo} onMouseDown={preventFocusLoss} onClick={redo}>
          Redo
        </button>
        <button type="button" className="email-editor__tool" disabled={disabled} onMouseDown={preventFocusLoss} onClick={resetTemplate}>
          Reset
        </button>
      </div>
      {linkOpen ? (
        <div className="email-editor__link">
          <label className="field__label" htmlFor="email-link-url">
            Link address
          </label>
          <div className="email-editor__link-row">
            <input
              id="email-link-url"
              className="field__input"
              value={linkUrl}
              disabled={disabled}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyLink()
                }
              }}
            />
            <button type="button" className="btn btn--primary" disabled={disabled} onClick={applyLink}>
              Add link
            </button>
          </div>
          {linkError ? <p className="settings-status settings-status--error">{linkError}</p> : null}
        </div>
      ) : null}

      <div className="email-vars" role="group" aria-label="Insert variable">
        {EMAIL_VARIABLES.map((variable) => (
          <button
            key={variable.id}
            type="button"
            className="email-var"
            disabled={disabled}
            onMouseDown={preventFocusLoss}
            onClick={() => insertVariable(variable.id)}
          >
            {variable.label}
          </button>
        ))}
      </div>

      <div
        ref={bodyRef}
        className="email-editor__body"
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label="Email message"
        spellCheck
        suppressContentEditableWarning
        onFocus={() => rememberSelection('body')}
        onMouseUp={() => rememberSelection('body')}
        onKeyUp={() => rememberSelection('body')}
        onKeyDown={(event) => onEditorKeyDown(event, 'body')}
        onInput={() => commit()}
      />

      <div className="email-sections" role="group" aria-label="Payment blocks">
        <p className="email-sections__title">Payment blocks</p>
        <p className="settings-help">
          These sit in the message once. Leave Zelle off when the payment memo
          already tells the customer how to pay.
        </p>
        {EMAIL_SECTION_IDS.map((id) => (
          <label key={id} className="email-sections__option">
            <input
              type="checkbox"
              checked={sections[id]}
              onChange={(event) => toggleSection(id, event.target.checked)}
            />
            {emailSectionLabel(id)}
          </label>
        ))}
      </div>
    </div>
  )
}
