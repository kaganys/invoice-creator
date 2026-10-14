import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import {
  editorHtmlToSubject,
  subjectToEditorHtml,
  variableChipHtml,
} from '../../invoice/emailCompose.ts'
import {
  documentToEditorHtml,
  editorHtmlToDocument,
  emailInsertHtml,
  type EmailInsertKind,
} from '../../invoice/emailDocument.ts'
import {
  EMAIL_VARIABLES,
  defaultEmailTemplates,
  type EmailVariableId,
} from '../../invoice/emailTemplates.ts'

export type EmailEditorBrand = {
  logoUrl?: string
  wordmarkUrl?: string
  senderName?: string
}

const INSERTS: Array<{ kind: EmailInsertKind; label: string }> = [
  { kind: 'button', label: 'Pay button' },
  { kind: 'link', label: 'Payment link' },
  { kind: 'amount', label: 'Amount due' },
  { kind: 'header', label: 'Header' },
  { kind: 'attachment', label: 'Attachment note' },
  { kind: 'footer', label: 'Footer' },
]

type Snapshot = { subject: string; html: string }

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

function partElement(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest('[data-email-part]') ?? null
}

export function EmailMessageEditor({
  subject,
  html,
  subjectPreview,
  disabled,
  brand,
  onChange,
}: {
  subject: string
  html: string
  subjectPreview: string
  disabled?: boolean
  brand?: EmailEditorBrand
  onChange: (next: { subject: string; html: string }) => void
}) {
  const brandAssets = {
    logoUrl: brand?.logoUrl,
    wordmarkUrl: brand?.wordmarkUrl,
  }
  const [seed, setSeed] = useState(() => documentToEditorHtml(html, brandAssets))
  const [revision, setRevision] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [linkError, setLinkError] = useState<string | null>(null)
  const subjectRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const subjectValue = useRef(subject)
  const bodyValue = useRef(html.trim() ? editorHtmlToDocument(documentToEditorHtml(html, brandAssets)) : '')
  const brandRef = useRef(brandAssets)
  const emitted = useRef('')
  const history = useRef<Snapshot[]>([])
  const index = useRef(0)
  const skipHistory = useRef(false)
  const fieldsRef = useRef<HTMLDivElement>(null)
  const insertRef = useRef<HTMLDivElement>(null)
  const active = useRef<'subject' | 'letter' | null>(null)
  brandRef.current = brandAssets

  function syncHistoryButtons() {
    setCanUndo(index.current > 0)
    setCanRedo(index.current < history.current.length - 1)
  }

  function publish(nextSubject: string, nextHtml: string, record: boolean) {
    const key = `${nextSubject}\n${nextHtml}`
    emitted.current = key
    bodyValue.current = nextHtml
    if (record && !skipHistory.current) {
      const snapshot = { subject: nextSubject, html: nextHtml }
      const stack = history.current.slice(0, index.current + 1)
      const previous = stack[stack.length - 1]
      if (!previous || previous.subject !== snapshot.subject || previous.html !== snapshot.html) {
        stack.push(snapshot)
        if (stack.length > 80) {
          stack.shift()
        }
        history.current = stack
        index.current = stack.length - 1
      }
    }
    syncHistoryButtons()
    onChange({ subject: nextSubject, html: nextHtml })
  }

  useEffect(() => {
    const canonical = html.trim() ? editorHtmlToDocument(documentToEditorHtml(html, brandRef.current)) : html
    const key = `${subject}\n${canonical}`
    if (key === emitted.current) {
      return
    }
    subjectValue.current = subject
    bodyValue.current = canonical
    setSeed(documentToEditorHtml(canonical, brandRef.current))
    setRevision((current) => current + 1)
    history.current = [{ subject, html: canonical }]
    index.current = 0
    setCanUndo(false)
    setCanRedo(false)
    emitted.current = key
    if (canonical !== html) {
      onChange({ subject, html: canonical })
    }
  }, [subject, html, onChange])

  useEffect(() => {
    const node = subjectRef.current
    if (!node) {
      return
    }
    node.innerHTML = subjectToEditorHtml(subjectValue.current)
  }, [revision])

  useEffect(() => {
    const node = sheetRef.current
    if (!node) {
      return
    }
    node.innerHTML = seed
  }, [revision, seed])

  useEffect(() => {
    const node = sheetRef.current
    if (!node || document.activeElement === node) {
      return
    }
    const next = documentToEditorHtml(bodyValue.current, brandAssets)
    if (node.innerHTML !== next) {
      node.innerHTML = next
    }
  }, [brandAssets.logoUrl, brandAssets.wordmarkUrl])

  useEffect(() => {
    if (!fieldsOpen && !insertOpen) {
      return
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (fieldsOpen && !fieldsRef.current?.contains(target)) {
        setFieldsOpen(false)
      }
      if (insertOpen && !insertRef.current?.contains(target)) {
        setInsertOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFieldsOpen(false)
        setInsertOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [fieldsOpen, insertOpen])

  function commitSubject(editorHtml: string, record = true) {
    const nextSubject = editorHtmlToSubject(editorHtml)
    subjectValue.current = nextSubject
    publish(nextSubject, bodyValue.current, record)
  }

  function commitSheet(record = true) {
    const nextHtml = editorHtmlToDocument(sheetRef.current?.innerHTML ?? '')
    publish(subjectValue.current, nextHtml, record)
  }

  function restore(snapshot: Snapshot) {
    skipHistory.current = true
    subjectValue.current = snapshot.subject
    bodyValue.current = snapshot.html
    setSeed(documentToEditorHtml(snapshot.html, brandRef.current))
    setRevision((current) => current + 1)
    publish(snapshot.subject, snapshot.html, false)
    skipHistory.current = false
    syncHistoryButtons()
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

  function onEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
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
    if (event.currentTarget === sheetRef.current && event.key === 'Enter' && !event.shiftKey) {
      const part = partElement(window.getSelection()?.anchorNode ?? null)
      const kind = part?.getAttribute('data-email-part')
      if (kind && kind !== 'payment') {
        event.preventDefault()
      }
    }
  }

  function runCommand(command: string, value?: string) {
    const node = active.current === 'subject' ? subjectRef.current : sheetRef.current
    if (!node) {
      return
    }
    node.focus()
    document.execCommand(command, false, value)
    if (node === subjectRef.current) {
      commitSubject(node.innerHTML)
    } else {
      commitSheet()
    }
  }

  function insertVariable(id: EmailVariableId) {
    const node = active.current === 'subject' ? subjectRef.current : sheetRef.current
    if (!node) {
      return
    }
    node.focus()
    document.execCommand('insertHTML', false, variableChipHtml(id))
    if (node === subjectRef.current) {
      commitSubject(node.innerHTML)
    } else {
      commitSheet()
    }
    setFieldsOpen(false)
  }

  function placeCaretInSheet() {
    const sheet = sheetRef.current
    if (!sheet) {
      return
    }
    if (active.current === 'letter' && document.activeElement === sheet) {
      return
    }
    sheet.focus()
    const range = document.createRange()
    range.selectNodeContents(sheet)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  function insertPart(kind: EmailInsertKind) {
    const sheet = sheetRef.current
    if (!sheet) {
      return
    }
    placeCaretInSheet()
    document.execCommand('insertHTML', false, emailInsertHtml(kind, brandRef.current))
    commitSheet()
    setInsertOpen(false)
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

  function resetTemplate() {
    const defaults = defaultEmailTemplates()
    const nextHtml = editorHtmlToDocument(documentToEditorHtml(defaults.body, brandRef.current))
    subjectValue.current = defaults.subject
    bodyValue.current = nextHtml
    setSeed(documentToEditorHtml(nextHtml, brandRef.current))
    setRevision((current) => current + 1)
    publish(defaults.subject, nextHtml, true)
  }

  function healSheet() {
    const node = sheetRef.current
    if (!node) {
      return
    }
    const canonical = editorHtmlToDocument(node.innerHTML)
    const healed = documentToEditorHtml(canonical, brandRef.current)
    if (node.innerHTML !== healed) {
      node.innerHTML = healed
    }
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
          className="email-rich email-rich--paper email-rich--line"
          contentEditable={!disabled}
          role="textbox"
          aria-label="Subject"
          aria-multiline="false"
          spellCheck
          suppressContentEditableWarning
          onFocus={() => {
            active.current = 'subject'
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
            }
            onEditorKeyDown(event)
          }}
          onInput={() => commitSubject(subjectRef.current?.innerHTML ?? '')}
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
        <div className="email-editor__menus">
          <div className="email-editor__fields" ref={fieldsRef}>
            <button
              type="button"
              className="email-editor__insert"
              aria-haspopup="menu"
              aria-expanded={fieldsOpen}
              disabled={disabled}
              onMouseDown={preventFocusLoss}
              onClick={() => {
                setFieldsOpen((open) => !open)
                setInsertOpen(false)
              }}
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
                      onClick={() => insertVariable(variable.id)}
                    >
                      {variable.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="email-editor__fields" ref={insertRef}>
            <button
              type="button"
              className="email-editor__insert"
              aria-haspopup="menu"
              aria-expanded={insertOpen}
              disabled={disabled}
              onMouseDown={preventFocusLoss}
              onClick={() => {
                setInsertOpen((open) => !open)
                setFieldsOpen(false)
              }}
            >
              Insert
            </button>
            {insertOpen ? (
              <ul className="email-editor__menu" role="menu">
                {INSERTS.map((item) => (
                  <li key={item.kind} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={disabled}
                      onMouseDown={preventFocusLoss}
                      onClick={() => insertPart(item.kind)}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
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

      <div className="email-page">
        <div
          ref={sheetRef}
          className="email-sheet"
          contentEditable={!disabled}
          role="textbox"
          aria-label="Email"
          aria-multiline="true"
          spellCheck
          suppressContentEditableWarning
          onFocus={() => {
            active.current = 'letter'
          }}
          onKeyDown={onEditorKeyDown}
          onInput={() => commitSheet()}
          onBlur={healSheet}
        />
      </div>
    </div>
  )
}
