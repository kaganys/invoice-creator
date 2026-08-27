import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
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
  createBlockFromPalette,
  defaultCanvasBlocks,
  insertCanvasBlock,
  moveCanvasBlock,
  parseEmailHtmlToBlocks,
  serializeEmailBlocks,
  type EmailCanvasBlock,
  type EmailCanvasBlockType,
} from '../../invoice/emailCanvas.ts'
import {
  prepareInvoiceEmail,
  SAMPLE_EMAIL_BRAND,
  SAMPLE_EMAIL_VARS,
} from '../../invoice/emailHtml.ts'
import { useFocusTrap } from '../../hooks/useFocusTrap.ts'
import { IconEye, IconX } from '../icons.tsx'
import './EmailTemplateEditor.css'

type EmailTemplateEditorProps = {
  open: boolean
  subject: string
  html: string
  onClose: () => void
  onApply: (next: { subject: string; html: string }) => void
}

type MobilePane = 'write' | 'blocks' | 'preview'

type DragState =
  | { kind: 'palette'; type: EmailBlockId }
  | { kind: 'reorder'; id: string }

const FONT_SIZES = ['2', '3', '4', '5', '6'] as const
const FONT_SIZE_LABELS: Record<(typeof FONT_SIZES)[number], string> = {
  '2': '11',
  '3': '12',
  '4': '14',
  '5': '18',
  '6': '24',
}

const BLOCK_LABEL: Record<EmailCanvasBlockType, string> = {
  hero: 'Header',
  greeting: 'Greeting',
  amount: 'Amount',
  details: 'Details',
  payment: 'Payment',
  button: 'Button',
  divider: 'Divider',
  spacer: 'Spacer',
  note: 'Sign-off',
  html: 'Text',
}

function runCommand(command: string, value?: string) {
  document.execCommand(command, false, value)
}

function Glyph({ path }: { path: string }) {
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
      <path d={path} />
    </svg>
  )
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

function CanvasBlock({
  block,
  selected,
  onFocus,
  onChange,
  onPointerDragStart,
}: {
  block: EmailCanvasBlock
  selected: boolean
  onFocus: () => void
  onChange: (html: string) => void
  onPointerDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = block.html || '<p></p>'
    }
  }, [block.id])

  return (
    <div
      className={selected ? 'email-doc-block is-selected' : 'email-doc-block'}
      data-block-id={block.id}
    >
      <button
        type="button"
        className="email-doc-block__handle"
        aria-label={`Move ${BLOCK_LABEL[block.type]}`}
        title="Drag to move"
        onPointerDown={onPointerDragStart}
      >
        <Glyph path="M10 5v14M14 5v14" />
      </button>
      <div
        ref={ref}
        className="email-doc-block__body"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={`${BLOCK_LABEL[block.type]} block`}
        onFocus={onFocus}
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
      />
    </div>
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
  const [draftSubject, setDraftSubject] = useState(subject)
  const [blocks, setBlocks] = useState<EmailCanvasBlock[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')
  const [mobilePane, setMobilePane] = useState<MobilePane>('write')
  const [textColor, setTextColor] = useState('#111111')
  const [highlight, setHighlight] = useState('#fde68a')
  const [fontSize, setFontSize] = useState<(typeof FONT_SIZES)[number]>('4')
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const skipPaletteClick = useRef(false)

  useFocusTrap(open, dialogRef, onClose)

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

  useEffect(() => {
    if (!open) {
      return
    }
    setDraftSubject(subject)
    const parsed = parseEmailHtmlToBlocks(html)
    setBlocks(parsed.length > 0 ? parsed : defaultCanvasBlocks())
    setFocusedId(parsed[0]?.id ?? null)
    setMobilePane('write')
    setDrag(null)
    setDropIndex(null)
  }, [open, subject, html])

  useEffect(() => {
    if (!drag) {
      return
    }
    function onPointerUp() {
      finishDrop()
    }
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [drag, dropIndex, blocks])

  if (!open) {
    return null
  }

  const editorHtml = serializeEmailBlocks(blocks)
  const preview = prepareInvoiceEmail(
    editorHtml,
    SAMPLE_EMAIL_VARS,
    SAMPLE_EMAIL_BRAND,
  )

  function format(command: string, value?: string) {
    runCommand(command, value)
  }

  function addLink() {
    const url = window.prompt('Link URL', 'https://')
    if (!url) {
      return
    }
    format('createLink', url)
  }

  function insertVariable(id: EmailVariableId) {
    runCommand('insertHTML', `&nbsp;${emailVariableChip(id)}&nbsp;`)
  }

  function insertBlockAt(type: EmailBlockId, index: number) {
    if (!EMAIL_BLOCKS.some((block) => block.id === type)) {
      return
    }
    const next = createBlockFromPalette(type)
    setBlocks((current) => insertCanvasBlock(current, index, next))
    setFocusedId(next.id)
  }

  function removeBlock(id: string) {
    setBlocks((current) => {
      const next = current.filter((block) => block.id !== id)
      return next.length > 0 ? next : defaultCanvasBlocks()
    })
  }

  function shiftBlock(id: string, direction: -1 | 1) {
    setBlocks((current) => {
      const from = current.findIndex((block) => block.id === id)
      if (from < 0) {
        return current
      }
      return moveCanvasBlock(current, from, from + direction)
    })
  }

  function updateBlockHtml(id: string, nextHtml: string) {
    setBlocks((current) =>
      current.map((block) =>
        block.id === id ? { ...block, html: nextHtml } : block,
      ),
    )
  }

  function finishDrop() {
    if (drag && dropIndex != null) {
      skipPaletteClick.current = true
      if (drag.kind === 'palette') {
        insertBlockAt(drag.type, dropIndex)
        setMobilePane('write')
      } else {
        const from = blocks.findIndex((block) => block.id === drag.id)
        if (from >= 0) {
          setBlocks((current) => moveCanvasBlock(current, from, dropIndex))
        }
      }
    }
    setDrag(null)
    setDropIndex(null)
  }

  function onPalettePointerDown(type: EmailBlockId) {
    skipPaletteClick.current = false
    setDrag({ kind: 'palette', type })
  }

  function onHandlePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
  ) {
    event.preventDefault()
    event.stopPropagation()
    setDrag({ kind: 'reorder', id })
  }

  const toolbar = (
    <div className="email-toolbar" role="toolbar" aria-label="Formatting">
      <ToolButton label="Undo" onClick={() => format('undo')}>
        <Glyph path="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 1 1 0 11H13" />
      </ToolButton>
      <ToolButton label="Redo" onClick={() => format('redo')}>
        <Glyph path="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 1 0 0 11H11" />
      </ToolButton>
      <span className="email-toolbar__rule" />
      <label className="email-tool email-tool--select">
        <span className="visually-hidden">Font size</span>
        <select
          className="email-font-size"
          value={fontSize}
          onChange={(event) => {
            const next = event.target.value as (typeof FONT_SIZES)[number]
            setFontSize(next)
            format('fontSize', next)
          }}
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {FONT_SIZE_LABELS[size]}
            </option>
          ))}
        </select>
      </label>
      <ToolButton label="Bold" onClick={() => format('bold')}>
        <strong>B</strong>
      </ToolButton>
      <ToolButton label="Italic" onClick={() => format('italic')}>
        <em>I</em>
      </ToolButton>
      <ToolButton label="Underline" onClick={() => format('underline')}>
        <span className="email-tool__u">U</span>
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
      <span className="email-toolbar__rule" />
      <ToolButton label="Heading" onClick={() => format('formatBlock', 'h2')}>
        <span className="email-tool__type">H</span>
      </ToolButton>
      <ToolButton label="Paragraph" onClick={() => format('formatBlock', 'p')}>
        <Glyph path="M13 5v14M9 5v8a4 4 0 0 1-4 4M9 5h10" />
      </ToolButton>
      <ToolButton
        label="Bulleted list"
        onClick={() => format('insertUnorderedList')}
      >
        <Glyph path="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        onClick={() => format('insertOrderedList')}
      >
        <Glyph path="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 16l2 2 2-2" />
      </ToolButton>
      <ToolButton label="Align left" onClick={() => format('justifyLeft')}>
        <Glyph path="M4 6h16M4 12h10M4 18h14" />
      </ToolButton>
      <ToolButton label="Align center" onClick={() => format('justifyCenter')}>
        <Glyph path="M4 6h16M7 12h10M5 18h14" />
      </ToolButton>
      <ToolButton label="Align right" onClick={() => format('justifyRight')}>
        <Glyph path="M4 6h16M10 12h10M6 18h14" />
      </ToolButton>
      <ToolButton label="Link" onClick={addLink}>
        <Glyph path="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07" />
      </ToolButton>
      <ToolButton label="Clear formatting" onClick={() => format('removeFormat')}>
        <Glyph path="M5 5l14 14M9 9 4 20M15 4 8.5 17" />
      </ToolButton>
    </div>
  )

  const palette = (
    <aside className="email-editor-palette">
      <div className="email-editor-palette__head">
        <p className="email-editor-palette__title">Blocks</p>
        <p className="email-editor-palette__hint">
          Drag onto the page, or tap to add.
        </p>
      </div>
      <div className="email-block-grid">
        {EMAIL_BLOCKS.map((block) => (
          <button
            key={block.id}
            type="button"
            className={`email-block-card email-block-card--${block.id}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/x-email-block', block.id)
              event.dataTransfer.setData('text/plain', `palette:${block.id}`)
              event.dataTransfer.effectAllowed = 'copy'
            }}
            onPointerDown={() => onPalettePointerDown(block.id)}
            onClick={() => {
              if (skipPaletteClick.current) {
                skipPaletteClick.current = false
                return
              }
              insertBlockAt(block.id, blocks.length)
              setMobilePane('write')
            }}
          >
            <span className="email-block-card__preview" aria-hidden="true" />
            <span className="email-block-card__meta">
              <span className="email-block-card__label">
                {BLOCK_LABEL[block.id]}
              </span>
              <span className="email-block-card__hint">{block.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="email-editor-palette__head">
        <p className="email-editor-palette__title">Fields</p>
      </div>
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
  )

  const previewPane = (
    <div className="email-editor-preview">
      <div className="email-editor-preview__bar">
        <span>Customer inbox</span>
        <div className="email-seg">
          <button
            type="button"
            className={previewMode === 'mobile' ? 'is-active' : ''}
            onClick={() => setPreviewMode('mobile')}
          >
            Phone
          </button>
          <button
            type="button"
            className={previewMode === 'desktop' ? 'is-active' : ''}
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
        <div className="email-device__chrome">
          <p className="email-device__from">Bitz Designs</p>
          <p className="email-device__subject">{draftSubject || 'Subject'}</p>
        </div>
        <iframe
          className="email-editor-preview__frame"
          title="Email preview"
          srcDoc={preview.html}
        />
      </div>
    </div>
  )

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
        className={`email-editor-modal__dialog is-pane-${mobilePane}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-editor-title"
        tabIndex={-1}
      >
        <header className="email-editor-top">
          <div className="email-editor-top__title">
            <h2 id="email-editor-title">Invoice email</h2>
            <p>Compose the message customers receive</p>
          </div>
          <div className="email-editor-top__actions">
            <button
              type="button"
              className="btn btn--ghost email-editor-top__reset"
              onClick={() => {
                const next = defaultCanvasBlocks()
                setBlocks(next)
                setFocusedId(next[0]?.id ?? null)
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn--icon"
              aria-label="Close"
              onClick={onClose}
            >
              <IconX />
            </button>
          </div>
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

        {toolbar}

        <div
          className={`email-editor-workspace is-${mobilePane}${drag ? ' is-dragging' : ''}`}
          onPointerMove={(event) => {
            if (!drag) {
              return
            }
            const target = document.elementFromPoint(
              event.clientX,
              event.clientY,
            )
            const slot = target?.closest('[data-drop-index]')
            if (slot instanceof HTMLElement) {
              const index = Number(slot.dataset.dropIndex)
              if (Number.isFinite(index)) {
                setDropIndex(index)
              }
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
          }}
        >
          {palette}

          <div className="email-editor-stage">
            <div className="email-page">
              <div className="email-page__sheet">
                <DropSlot
                  index={0}
                  active={dropIndex === 0}
                  onDragEnter={() => setDropIndex(0)}
                  onDropType={(type) => insertBlockAt(type, 0)}
                  onDropId={(id) => {
                    const from = blocks.findIndex((block) => block.id === id)
                    if (from >= 0) {
                      setBlocks((current) => moveCanvasBlock(current, from, 0))
                    }
                  }}
                  onDropped={() => {
                    skipPaletteClick.current = true
                    setDrag(null)
                    setDropIndex(null)
                    setMobilePane('write')
                  }}
                />
                {blocks.map((block, index) => (
                  <div key={block.id} className="email-doc-stack">
                    <div className="email-doc-block__chrome">
                      <span>{BLOCK_LABEL[block.type]}</span>
                      <div className="email-doc-block__actions">
                        <button
                          type="button"
                          className="email-mini"
                          disabled={index === 0}
                          aria-label="Move up"
                          onClick={() => shiftBlock(block.id, -1)}
                        >
                          <Glyph path="M12 19V5M5 12l7-7 7 7" />
                        </button>
                        <button
                          type="button"
                          className="email-mini"
                          disabled={index === blocks.length - 1}
                          aria-label="Move down"
                          onClick={() => shiftBlock(block.id, 1)}
                        >
                          <Glyph path="M12 5v14M5 12l7 7 7-7" />
                        </button>
                        <button
                          type="button"
                          className="email-mini"
                          aria-label="Delete block"
                          onClick={() => removeBlock(block.id)}
                        >
                          <Glyph path="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </button>
                      </div>
                    </div>
                    <div
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/x-email-block-id',
                          block.id,
                        )
                        event.dataTransfer.setData(
                          'text/plain',
                          `reorder:${block.id}`,
                        )
                        event.dataTransfer.effectAllowed = 'move'
                        setDrag({ kind: 'reorder', id: block.id })
                      }}
                      onDragEnd={() => {
                        setDrag(null)
                        setDropIndex(null)
                      }}
                    >
                      <CanvasBlock
                        block={block}
                        selected={focusedId === block.id}
                        onFocus={() => setFocusedId(block.id)}
                        onChange={(nextHtml) =>
                          updateBlockHtml(block.id, nextHtml)
                        }
                        onPointerDragStart={(event) =>
                          onHandlePointerDown(event, block.id)
                        }
                      />
                    </div>
                    <DropSlot
                      index={index + 1}
                      active={dropIndex === index + 1}
                      onDragEnter={() => setDropIndex(index + 1)}
                      onDropType={(type) => insertBlockAt(type, index + 1)}
                      onDropId={(id) => {
                        const from = blocks.findIndex((item) => item.id === id)
                        if (from >= 0) {
                          setBlocks((current) =>
                            moveCanvasBlock(current, from, index + 1),
                          )
                        }
                      }}
                      onDropped={() => {
                        skipPaletteClick.current = true
                        setDrag(null)
                        setDropIndex(null)
                        setMobilePane('write')
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {previewPane}
        </div>

        <nav className="email-mobile-panes" aria-label="Designer views">
          <button
            type="button"
            className={mobilePane === 'blocks' ? 'is-active' : ''}
            onClick={() => setMobilePane('blocks')}
          >
            <Glyph path="M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z" />
            Blocks
          </button>
          <button
            type="button"
            className={mobilePane === 'write' ? 'is-active' : ''}
            onClick={() => setMobilePane('write')}
          >
            <Glyph path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            Edit
          </button>
          <button
            type="button"
            className={mobilePane === 'preview' ? 'is-active' : ''}
            onClick={() => setMobilePane('preview')}
          >
            <IconEye />
            Preview
          </button>
        </nav>

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
                html: serializeEmailBlocks(blocks),
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

function DropSlot({
  index,
  active,
  onDragEnter,
  onDropType,
  onDropId,
  onDropped,
}: {
  index: number
  active: boolean
  onDragEnter: () => void
  onDropType: (type: EmailBlockId) => void
  onDropId: (id: string) => void
  onDropped: () => void
}) {
  return (
    <div
      className={active ? 'email-drop is-active' : 'email-drop'}
      data-drop-index={index}
      onDragEnter={(event) => {
        event.preventDefault()
        onDragEnter()
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const fallback = event.dataTransfer.getData('text/plain')
        const type = (event.dataTransfer.getData('application/x-email-block') ||
          (fallback.startsWith('palette:')
            ? fallback.slice('palette:'.length)
            : '')) as EmailBlockId
        const id =
          event.dataTransfer.getData('application/x-email-block-id') ||
          (fallback.startsWith('reorder:')
            ? fallback.slice('reorder:'.length)
            : '')
        if (type) {
          onDropType(type)
          onDropped()
        } else if (id) {
          onDropId(id)
          onDropped()
        }
      }}
    />
  )
}
