import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
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

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="email-editor__tool"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={preventFocusLoss}
      onClick={onClick}
    >
      {children}
    </button>
  )
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
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const fieldsRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!fieldsOpen) {
      return
    }
    function onPointerDown(event: MouseEvent) {
      if (!fieldsRef.current?.contains(event.target as Node)) {
        setFieldsOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFieldsOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [fieldsOpen])

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

      <div className="email-editor__bar">
      <div className="email-editor__toolbar" role="toolbar" aria-label="Formatting">
        <div className="email-editor__group">
          <ToolButton label="Bold" disabled={disabled} onClick={() => runCommand('bold')}>
            <ToolIcon>
              <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
              <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
            </ToolIcon>
          </ToolButton>
          <ToolButton label="Italic" disabled={disabled} onClick={() => runCommand('italic')}>
            <ToolIcon>
              <path d="M19 4h-9" />
              <path d="M14 20H5" />
              <path d="m15 4-6 16" />
            </ToolIcon>
          </ToolButton>
          <ToolButton
            label="Link"
            disabled={disabled}
            onClick={() => {
              setLinkOpen((open) => !open)
              setLinkError(null)
            }}
          >
            <ToolIcon>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </ToolIcon>
          </ToolButton>
        </div>
        <span className="email-editor__divider" aria-hidden="true" />
        <div className="email-editor__group">
          <ToolButton label="Bulleted list" disabled={disabled} onClick={() => runCommand('insertUnorderedList')}>
            <ToolIcon>
              <path d="M9 6h12" />
              <path d="M9 12h12" />
              <path d="M9 18h12" />
              <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
              <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
              <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
            </ToolIcon>
          </ToolButton>
          <ToolButton label="Numbered list" disabled={disabled} onClick={() => runCommand('insertOrderedList')}>
            <ToolIcon>
              <path d="M10 6h11" />
              <path d="M10 12h11" />
              <path d="M10 18h11" />
              <path d="M4 6h1v4" />
              <path d="M4 10h2" />
              <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
            </ToolIcon>
          </ToolButton>
        </div>
        <span className="email-editor__divider" aria-hidden="true" />
        <div className="email-editor__group">
          <ToolButton label="Align left" disabled={disabled} onClick={() => runCommand('justifyLeft')}>
            <ToolIcon>
              <path d="M4 6h16" />
              <path d="M4 12h10" />
              <path d="M4 18h14" />
            </ToolIcon>
          </ToolButton>
          <ToolButton label="Align center" disabled={disabled} onClick={() => runCommand('justifyCenter')}>
            <ToolIcon>
              <path d="M4 6h16" />
              <path d="M7 12h10" />
              <path d="M5 18h14" />
            </ToolIcon>
          </ToolButton>
          <ToolButton label="Align right" disabled={disabled} onClick={() => runCommand('justifyRight')}>
            <ToolIcon>
              <path d="M4 6h16" />
              <path d="M10 12h10" />
              <path d="M6 18h14" />
            </ToolIcon>
          </ToolButton>
        </div>
        <span className="email-editor__divider" aria-hidden="true" />
        <div className="email-editor__group">
          <ToolButton label="Undo" disabled={disabled || !canUndo} onClick={undo}>
            <ToolIcon>
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H12" />
            </ToolIcon>
          </ToolButton>
          <ToolButton label="Redo" disabled={disabled || !canRedo} onClick={redo}>
            <ToolIcon>
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H12" />
            </ToolIcon>
          </ToolButton>
          <ToolButton label="Reset to the default message" disabled={disabled} onClick={resetTemplate}>
            <ToolIcon>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </ToolIcon>
          </ToolButton>
        </div>
      </div>
        <div className="email-editor__fields" ref={fieldsRef}>
          <button
            type="button"
            className="email-editor__insert"
            aria-haspopup="menu"
            aria-expanded={fieldsOpen}
            disabled={disabled}
            onMouseDown={preventFocusLoss}
            onClick={() => setFieldsOpen((open) => !open)}
          >
            Insert field
          </button>
          {fieldsOpen ? (
            <ul className="email-editor__menu" role="menu">
              {EMAIL_VARIABLES.map((variable) => (
                <li key={variable.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onMouseDown={preventFocusLoss}
                    onClick={() => {
                      insertVariable(variable.id)
                      setFieldsOpen(false)
                    }}
                  >
                    {variable.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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
        <p className="email-sections__title">Include</p>
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
