import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import {
  editorHtmlToSubject,
  proseToEditorHtml,
  sanitizeProseHtml,
  subjectToEditorHtml,
  variableChipHtml,
} from '../../invoice/emailCompose.ts'
import {
  EMAIL_BLOCK_TYPES,
  createEmailBlock,
  emailBlockLabel,
  readEmailBlocks,
  safeEmailColor,
  writeEmailBlocks,
  type EmailBlock,
  type EmailBlockType,
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

type Snapshot = {
  subject: string
  blocks: EmailBlock[]
}

type FieldName =
  | 'html'
  | 'label'
  | 'dueLabel'
  | 'lead'
  | 'text'
  | 'zelleLabel'

function cloneBlocks(blocks: EmailBlock[]): EmailBlock[] {
  return JSON.parse(JSON.stringify(blocks)) as EmailBlock[]
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

function RichText({
  blockId,
  field,
  mode,
  value,
  revision,
  disabled,
  label,
  className,
  onFocus,
  onInput,
  onKeyDown,
}: {
  blockId: string
  field: FieldName
  mode: 'prose' | 'line'
  value: string
  revision: number
  disabled?: boolean
  label: string
  className: string
  onFocus: (target: { id: string; field: FieldName; mode: 'prose' | 'line'; node: HTMLDivElement }) => void
  onInput: (id: string, field: FieldName, html: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }
    node.innerHTML = mode === 'line' ? subjectToEditorHtml(value) : proseToEditorHtml(value)
  }, [revision])

  return (
    <div
      ref={ref}
      className={className}
      contentEditable={!disabled}
      role="textbox"
      aria-label={label}
      aria-multiline={mode === 'prose'}
      data-block-id={blockId}
      data-field={field}
      spellCheck
      suppressContentEditableWarning
      onFocus={() => {
        if (ref.current) {
          onFocus({ id: blockId, field, mode, node: ref.current })
        }
      }}
      onKeyDown={(event) => {
        if (mode === 'line' && event.key === 'Enter') {
          event.preventDefault()
        }
        onKeyDown(event)
      }}
      onInput={() => onInput(blockId, field, ref.current?.innerHTML ?? '')}
    />
  )
}

function applyField(block: EmailBlock, field: FieldName, editorHtml: string): EmailBlock {
  const line = editorHtmlToSubject(editorHtml)
  const prose = sanitizeProseHtml(editorHtml).trim()
  switch (block.type) {
    case 'text':
      return { ...block, html: prose }
    case 'payment':
      return field === 'zelleLabel'
        ? { ...block, zelleLabel: line || 'Zelle' }
        : { ...block, html: prose }
    case 'amount':
      return field === 'dueLabel'
        ? { ...block, dueLabel: line }
        : { ...block, label: line || 'Amount due' }
    case 'button':
      return { ...block, label: line || 'Pay Online' }
    case 'link':
      return { ...block, lead: line }
    case 'attachment':
      return { ...block, text: line }
    case 'footer':
      return { ...block, text: line }
    default:
      return block
  }
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
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => readEmailBlocks(html))
  const [subjectDraft, setSubjectDraft] = useState(subject)
  const [revision, setRevision] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [linkError, setLinkError] = useState<string | null>(null)
  const blocksRef = useRef(blocks)
  const subjectValue = useRef(subject)
  const emitted = useRef('')
  const history = useRef<Snapshot[]>([])
  const index = useRef(0)
  const skipHistory = useRef(false)
  const fieldsRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLDivElement>(null)
  const active = useRef<{
    id: string
    field: FieldName
    mode: 'prose' | 'line'
    node: HTMLDivElement
  } | null>(null)
  blocksRef.current = blocks
  subjectValue.current = subjectDraft

  function syncHistoryButtons() {
    setCanUndo(index.current > 0)
    setCanRedo(index.current < history.current.length - 1)
  }

  function publish(nextSubject: string, nextBlocks: EmailBlock[], record: boolean) {
    const nextHtml = writeEmailBlocks(nextBlocks)
    const key = `${nextSubject}\n${nextHtml}`
    emitted.current = key
    if (record && !skipHistory.current) {
      const snapshot: Snapshot = { subject: nextSubject, blocks: cloneBlocks(nextBlocks) }
      const stack = history.current.slice(0, index.current + 1)
      const previous = stack[stack.length - 1]
      const changed =
        !previous ||
        previous.subject !== snapshot.subject ||
        JSON.stringify(previous.blocks) !== JSON.stringify(snapshot.blocks)
      if (changed) {
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
    const canonical = html.trim() ? writeEmailBlocks(readEmailBlocks(html)) : html
    const key = `${subject}\n${canonical}`
    if (key === emitted.current) {
      return
    }
    const nextBlocks = html.trim() ? readEmailBlocks(html) : []
    blocksRef.current = nextBlocks
    subjectValue.current = subject
    setBlocks(nextBlocks)
    setSubjectDraft(subject)
    setRevision((current) => current + 1)
    history.current = [{ subject, blocks: cloneBlocks(nextBlocks) }]
    index.current = 0
    setCanUndo(false)
    setCanRedo(false)
    emitted.current = key
    if (canonical !== html) {
      onChange({ subject, html: canonical })
    }
  }, [subject, html, onChange])

  useEffect(() => {
    if (!fieldsOpen && !addOpen) {
      return
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (fieldsOpen && !fieldsRef.current?.contains(target)) {
        setFieldsOpen(false)
      }
      if (addOpen && !addRef.current?.contains(target)) {
        setAddOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFieldsOpen(false)
        setAddOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [fieldsOpen, addOpen])

  function commitField(id: string, field: FieldName, editorHtml: string, record = true) {
    if (id === 'subject') {
      const nextSubject = editorHtmlToSubject(editorHtml)
      subjectValue.current = nextSubject
      setSubjectDraft(nextSubject)
      publish(nextSubject, blocksRef.current, record)
      return
    }
    const next = blocksRef.current.map((block) =>
      block.id === id ? applyField(block, field, editorHtml) : block,
    )
    blocksRef.current = next
    setBlocks(next)
    publish(subjectValue.current, next, record)
  }

  function replaceBlocks(next: EmailBlock[], record = true) {
    blocksRef.current = next
    setBlocks(next)
    publish(subjectValue.current, next, record)
  }

  function restore(snapshot: Snapshot) {
    skipHistory.current = true
    const nextBlocks = cloneBlocks(snapshot.blocks)
    blocksRef.current = nextBlocks
    subjectValue.current = snapshot.subject
    setBlocks(nextBlocks)
    setSubjectDraft(snapshot.subject)
    setRevision((current) => current + 1)
    publish(snapshot.subject, nextBlocks, false)
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
    }
  }

  function runCommand(command: string, value?: string) {
    const current = active.current
    if (!current) {
      return
    }
    current.node.focus()
    document.execCommand(command, false, value)
    commitField(current.id, current.field, current.node.innerHTML)
  }

  function insertVariable(id: EmailVariableId) {
    const current = active.current
    if (!current) {
      return
    }
    current.node.focus()
    document.execCommand('insertHTML', false, variableChipHtml(id))
    commitField(current.id, current.field, current.node.innerHTML)
    setFieldsOpen(false)
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
    const nextBlocks = readEmailBlocks(defaults.body)
    subjectValue.current = defaults.subject
    setSubjectDraft(defaults.subject)
    setRevision((current) => current + 1)
    replaceBlocks(nextBlocks)
  }

  function patchBlock(id: string, patch: (block: EmailBlock) => EmailBlock) {
    replaceBlocks(blocksRef.current.map((block) => (block.id === id ? patch(block) : block)))
  }

  function move(index: number, delta: number) {
    const next = blocksRef.current.slice()
    const target = index + delta
    if (target < 0 || target >= next.length) {
      return
    }
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    replaceBlocks(next)
  }

  function addBlock(type: EmailBlockType) {
    const created = createEmailBlock(type, blocksRef.current)
    replaceBlocks([...blocksRef.current, created])
    setAddOpen(false)
  }

  const senderName = brand?.senderName?.trim() || 'Sender name'

  return (
    <div className="email-editor">
      <div className="email-editor__subject">
        <label className="field__label" htmlFor="email-subject">
          Subject
        </label>
        <RichText
          blockId="subject"
          field="label"
          mode="line"
          value={subjectDraft}
          revision={revision}
          disabled={disabled}
          label="Subject"
          className="email-rich email-rich--paper email-rich--line"
          onFocus={(target) => {
            active.current = target
          }}
          onInput={(id, field, editorHtml) => commitField(id, field, editorHtml)}
          onKeyDown={onEditorKeyDown}
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
                    onClick={() => insertVariable(variable.id)}
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

      <div className="email-blocks">
        {blocks.length === 0 ? (
          <p className="email-block__note">This email is empty. Add a block, or reset to the default.</p>
        ) : null}
        {blocks.map((block, index) => (
          <article
            key={block.id}
            className={block.enabled ? 'email-block' : 'email-block is-hidden'}
          >
            <div className="email-block__bar">
              <div className="email-editor__group">
                <ToolButton
                  label={`Move ${emailBlockLabel(block.type)} up`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ToolIcon>
                    <path d="m6 14 6-6 6 6" />
                  </ToolIcon>
                </ToolButton>
                <ToolButton
                  label={`Move ${emailBlockLabel(block.type)} down`}
                  disabled={disabled || index === blocks.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ToolIcon>
                    <path d="m6 10 6 6 6-6" />
                  </ToolIcon>
                </ToolButton>
              </div>
              <h3 className="email-block__title">{emailBlockLabel(block.type)}</h3>
              {block.enabled ? null : <span className="email-block__badge">Hidden</span>}
              <div className="email-block__actions">
                <button
                  type="button"
                  className="email-block__text-btn"
                  disabled={disabled}
                  onClick={() =>
                    patchBlock(block.id, (current) => ({ ...current, enabled: !current.enabled }))
                  }
                >
                  {block.enabled ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  className="email-block__text-btn"
                  disabled={disabled}
                  onClick={() => replaceBlocks(blocksRef.current.filter((item) => item.id !== block.id))}
                >
                  Remove
                </button>
              </div>
            </div>
            {block.enabled ? (
              <BlockBody
                block={block}
                revision={revision}
                disabled={disabled}
                senderName={senderName}
                logoUrl={brand?.logoUrl}
                wordmarkUrl={brand?.wordmarkUrl}
                onFocus={(target) => {
                  active.current = target
                }}
                onInput={commitField}
                onKeyDown={onEditorKeyDown}
                onPatch={(patch) => patchBlock(block.id, patch)}
              />
            ) : (
              <p className="email-block__note">Hidden blocks are left out of the email.</p>
            )}
          </article>
        ))}
      </div>

      <div className="email-add" ref={addRef}>
        <button
          type="button"
          className="email-editor__insert"
          aria-haspopup="menu"
          aria-expanded={addOpen}
          disabled={disabled}
          onClick={() => setAddOpen((open) => !open)}
        >
          Add block
        </button>
        {addOpen ? (
          <ul className="email-editor__menu email-add__menu" role="menu">
            {EMAIL_BLOCK_TYPES.map((type) => (
              <li key={type} role="none">
                <button type="button" role="menuitem" disabled={disabled} onClick={() => addBlock(type)}>
                  {emailBlockLabel(type)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const safe = safeEmailColor(value, '#111111')
  const full = safe.length === 4
    ? `#${safe[1]}${safe[1]}${safe[2]}${safe[2]}${safe[3]}${safe[3]}`
    : safe
  return (
    <label className="email-block__field">
      <span>{label}</span>
      <input
        className="email-block__color"
        type="color"
        value={full}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function BlockBody({
  block,
  revision,
  disabled,
  senderName,
  logoUrl,
  wordmarkUrl,
  onFocus,
  onInput,
  onKeyDown,
  onPatch,
}: {
  block: EmailBlock
  revision: number
  disabled?: boolean
  senderName: string
  logoUrl?: string
  wordmarkUrl?: string
  onFocus: (target: { id: string; field: FieldName; mode: 'prose' | 'line'; node: HTMLDivElement }) => void
  onInput: (id: string, field: FieldName, html: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onPatch: (patch: (block: EmailBlock) => EmailBlock) => void
}) {
  const line = (field: FieldName, value: string, label: string, className: string) => (
    <RichText
      blockId={block.id}
      field={field}
      mode="line"
      value={value}
      revision={revision}
      disabled={disabled}
      label={label}
      className={className}
      onFocus={onFocus}
      onInput={onInput}
      onKeyDown={onKeyDown}
    />
  )

  if (block.type === 'header') {
    const background = safeEmailColor(block.background, '#111111')
    const color = safeEmailColor(block.color, '#f7f3ec')
    return (
      <div className="email-block__stack">
        <div className="email-header-preview" style={{ background, color }}>
          <div className="email-header-preview__lockup">
            {block.showLogo && logoUrl ? (
              <img src={logoUrl} alt="" width={56} height={56} />
            ) : null}
            {block.showWordmark && wordmarkUrl ? (
              <img className="email-header-preview__wordmark" src={wordmarkUrl} alt="" />
            ) : null}
          </div>
          {block.showName ? <p>{senderName}</p> : null}
        </div>
        <div className="email-block__fields">
          <ColorField
            label="Background"
            value={block.background}
            disabled={disabled}
            onChange={(value) => onPatch((current) => current.type === 'header' ? { ...current, background: value } : current)}
          />
          <ColorField
            label="Name color"
            value={block.color}
            disabled={disabled}
            onChange={(value) => onPatch((current) => current.type === 'header' ? { ...current, color: value } : current)}
          />
        </div>
        <div className="email-block__checks">
          <label>
            <input
              type="checkbox"
              checked={block.showLogo}
              disabled={disabled}
              onChange={(event) =>
                onPatch((current) =>
                  current.type === 'header' ? { ...current, showLogo: event.target.checked } : current,
                )
              }
            />
            Logo
          </label>
          <label>
            <input
              type="checkbox"
              checked={block.showWordmark}
              disabled={disabled}
              onChange={(event) =>
                onPatch((current) =>
                  current.type === 'header' ? { ...current, showWordmark: event.target.checked } : current,
                )
              }
            />
            Wordmark
          </label>
          <label>
            <input
              type="checkbox"
              checked={block.showName}
              disabled={disabled}
              onChange={(event) =>
                onPatch((current) =>
                  current.type === 'header' ? { ...current, showName: event.target.checked } : current,
                )
              }
            />
            Sender name
          </label>
        </div>
      </div>
    )
  }

  if (block.type === 'text') {
    return (
      <RichText
        blockId={block.id}
        field="html"
        mode="prose"
        value={block.html}
        revision={revision}
        disabled={disabled}
        label="Text"
        className="email-rich email-rich--paper"
        onFocus={onFocus}
        onInput={onInput}
        onKeyDown={onKeyDown}
      />
    )
  }

  if (block.type === 'amount') {
    return (
      <div className="email-block__stack">
        <div
          className="email-amount"
          style={{
            background: safeEmailColor(block.background, '#f7f3ec'),
            borderColor: safeEmailColor(block.border, '#e4ddd2'),
            color: safeEmailColor(block.labelColor, '#5c564e'),
          }}
        >
          {line('label', block.label, 'Amount label', 'email-rich email-rich--plain email-amount__label')}
          <div
            className="email-amount__value"
            style={{ color: safeEmailColor(block.amountColor, '#1c1917') }}
          >
            <span data-email-var="amount">Amount due</span>
          </div>
          {line('dueLabel', block.dueLabel, 'Due line', 'email-rich email-rich--plain')}
        </div>
        <div className="email-block__fields">
          <ColorField label="Box" value={block.background} disabled={disabled} onChange={(value) => onPatch((current) => current.type === 'amount' ? { ...current, background: value } : current)} />
          <ColorField label="Border" value={block.border} disabled={disabled} onChange={(value) => onPatch((current) => current.type === 'amount' ? { ...current, border: value } : current)} />
          <ColorField label="Label" value={block.labelColor} disabled={disabled} onChange={(value) => onPatch((current) => current.type === 'amount' ? { ...current, labelColor: value } : current)} />
          <ColorField label="Amount" value={block.amountColor} disabled={disabled} onChange={(value) => onPatch((current) => current.type === 'amount' ? { ...current, amountColor: value } : current)} />
        </div>
      </div>
    )
  }

  if (block.type === 'payment') {
    return (
      <div className="email-block__stack">
        <RichText
          blockId={block.id}
          field="html"
          mode="prose"
          value={block.html}
          revision={revision}
          disabled={disabled}
          label="Payment instructions"
          className="email-rich email-rich--paper"
          onFocus={onFocus}
          onInput={onInput}
          onKeyDown={onKeyDown}
        />
        <label className="email-block__checks">
          <input
            type="checkbox"
            checked={block.showZelle}
            disabled={disabled}
            onChange={(event) =>
              onPatch((current) =>
                current.type === 'payment' ? { ...current, showZelle: event.target.checked } : current,
              )
            }
          />
          Zelle address
        </label>
        {block.showZelle
          ? line('zelleLabel', block.zelleLabel, 'Zelle label', 'email-rich email-rich--paper email-rich--line')
          : null}
      </div>
    )
  }

  if (block.type === 'button') {
    return (
      <div className="email-block__stack">
        <div
          className="email-pay-preview"
          style={{
            background: safeEmailColor(block.background, '#24352c'),
            color: safeEmailColor(block.color, '#f7f3ec'),
          }}
        >
          {line('label', block.label, 'Button text', 'email-rich email-rich--plain email-rich--button')}
        </div>
        <div className="email-block__fields">
          <ColorField label="Button" value={block.background} disabled={disabled} onChange={(value) => onPatch((current) => current.type === 'button' ? { ...current, background: value } : current)} />
          <ColorField label="Text" value={block.color} disabled={disabled} onChange={(value) => onPatch((current) => current.type === 'button' ? { ...current, color: value } : current)} />
        </div>
      </div>
    )
  }

  if (block.type === 'link') {
    return (
      <div className="email-rich email-rich--paper email-link-preview">
        {line('lead', block.lead, 'Link fallback', 'email-rich email-rich--plain')}
        <div>
          <span data-email-var="payment_url">Payment link</span>
        </div>
      </div>
    )
  }

  if (block.type === 'attachment') {
    return line('text', block.text, 'Attachment note', 'email-rich email-rich--paper email-rich--line')
  }

  return line('text', block.text, 'Footer', 'email-rich email-rich--paper email-rich--line email-rich--center')
}
