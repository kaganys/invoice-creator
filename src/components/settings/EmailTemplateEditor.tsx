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
  PALETTE_BLOCKS,
  emailVariableChip,
  type EmailBlockId,
} from '../../invoice/emailBlocks.ts'
import {
  createBlockFromPalette,
  createFieldItem,
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

type DragSession = {
  kind: 'palette' | 'reorder' | 'field'
  type?: EmailBlockId
  variableId?: EmailVariableId
  id?: string
  fromIndex: number
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  label: string
}

const FONT_SIZES = ['2', '3', '4', '5', '6'] as const
const FONT_SIZE_LABELS: Record<(typeof FONT_SIZES)[number], string> = {
  '2': '11',
  '3': '12',
  '4': '14',
  '5': '18',
  '6': '24',
}

const ITEM_LABEL: Record<EmailCanvasBlockType, string> = {
  hero: 'Header',
  heading: 'Heading',
  text: 'Text',
  greeting: 'Text',
  amount: 'Amount',
  details: 'Details',
  payment: 'Payment',
  button: 'Button',
  divider: 'Line',
  spacer: 'Space',
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
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="email-tool"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function CanvasItem({
  block,
  selected,
  dragging,
  onFocus,
  onChange,
}: {
  block: EmailCanvasBlock
  selected: boolean
  dragging: boolean
  onFocus: () => void
  onChange: (html: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = block.html || '<p></p>'
    }
  }, [block.id])

  return (
    <div
      className={
        selected
          ? 'email-item__body is-selected'
          : 'email-item__body'
      }
      data-kind={block.type}
    >
      <div
        ref={ref}
        className="email-item__edit"
        contentEditable={!dragging}
        suppressContentEditableWarning
        role="textbox"
        aria-label={`${ITEM_LABEL[block.type]} item`}
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
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const dropIndexRef = useRef<number | null>(null)
  const skipClickRef = useRef(false)
  const [draftSubject, setDraftSubject] = useState(subject)
  const [blocks, setBlocks] = useState<EmailCanvasBlock[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile')
  const [mobilePane, setMobilePane] = useState<MobilePane>('write')
  const [textColor, setTextColor] = useState('#111111')
  const [highlight, setHighlight] = useState('#fde68a')
  const [fontSize, setFontSize] = useState<(typeof FONT_SIZES)[number]>('4')
  const [drag, setDrag] = useState<DragSession | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

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
    dragRef.current = null
    dropIndexRef.current = null
  }, [open, subject, html])

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
    const next = createBlockFromPalette(type)
    setBlocks((current) => insertCanvasBlock(current, index, next))
    setFocusedId(next.id)
  }

  function insertFieldAt(variableId: EmailVariableId, index: number) {
    const next = createFieldItem(variableId)
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

  function readDropIndex(clientY: number): number {
    const nodes = stageRef.current?.querySelectorAll<HTMLElement>(
      '[data-item-index]',
    )
    if (!nodes || nodes.length === 0) {
      return 0
    }
    for (const node of nodes) {
      const rect = node.getBoundingClientRect()
      const index = Number(node.dataset.itemIndex)
      if (clientY < rect.top + rect.height / 2) {
        return index
      }
    }
    return nodes.length
  }

  function applyDrag(session: DragSession, at: number) {
    if (session.kind === 'palette' && session.type) {
      insertBlockAt(session.type, at)
      setMobilePane('write')
      return
    }
    if (session.kind === 'field' && session.variableId) {
      insertFieldAt(session.variableId, at)
      setMobilePane('write')
      return
    }
    if (session.kind === 'reorder' && session.id) {
      setBlocks((current) => {
        const from = current.findIndex((block) => block.id === session.id)
        if (from < 0) {
          return current
        }
        return moveCanvasBlock(current, from, at)
      })
    }
  }

  function onPointerMove(event: PointerEvent) {
    const session = dragRef.current
    if (!session) {
      return
    }
    const dist = Math.hypot(
      event.clientX - session.startX,
      event.clientY - session.startY,
    )
    const active = session.active || dist > 6
    const next = {
      ...session,
      active,
      x: event.clientX,
      y: event.clientY,
    }
    dragRef.current = next
    setDrag(next)
    if (active) {
      event.preventDefault()
      const at = readDropIndex(event.clientY)
      dropIndexRef.current = at
      setDropIndex(at)
    }
  }

  function onPointerUp() {
    const session = dragRef.current
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    if (session?.active) {
      skipClickRef.current = true
      applyDrag(
        session,
        dropIndexRef.current ?? readDropIndex(session.y),
      )
    }
    dragRef.current = null
    dropIndexRef.current = null
    setDrag(null)
    setDropIndex(null)
  }

  function beginDrag(
    event: ReactPointerEvent,
    session: Omit<DragSession, 'startX' | 'startY' | 'x' | 'y' | 'active'>,
  ) {
    if (session.kind === 'reorder') {
      event.preventDefault()
    }
    event.stopPropagation()
    const next: DragSession = {
      ...session,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    }
    dragRef.current = next
    setDrag(next)
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
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
        <Glyph path="M10 6h11M10 12h11M10 18h11M4 6h1v4" />
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
    </div>
  )

  const palette = (
    <aside className="email-editor-palette">
      <div className="email-editor-palette__head">
        <p className="email-editor-palette__title">Items</p>
        <p className="email-editor-palette__hint">
          Drag any item onto the email. Each one moves on its own.
        </p>
      </div>
      <div className="email-block-grid">
        {PALETTE_BLOCKS.map((block) => (
          <button
            key={block.id}
            type="button"
            className={`email-block-card email-block-card--${block.id}`}
            onClick={() => {
              if (skipClickRef.current) {
                skipClickRef.current = false
                return
              }
              insertBlockAt(block.id, blocks.length)
              setMobilePane('write')
            }}
          >
            <span
              className="email-block-card__grip"
              aria-hidden="true"
              onPointerDown={(event) =>
                beginDrag(event, {
                  kind: 'palette',
                  type: block.id,
                  fromIndex: -1,
                  label: ITEM_LABEL[block.id],
                })
              }
            >
              <Glyph path="M10 5v14M14 5v14" />
            </span>
            <span className="email-block-card__preview" aria-hidden="true" />
            <span className="email-block-card__meta">
              <span className="email-block-card__label">
                {ITEM_LABEL[block.id]}
              </span>
              <span className="email-block-card__hint">{block.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="email-editor-palette__head">
        <p className="email-editor-palette__title">Fields</p>
        <p className="email-editor-palette__hint">
          Drag onto the page, or tap to insert at the cursor.
        </p>
      </div>
      <div className="email-editor-vars">
        {EMAIL_VARIABLES.map((variable) => (
          <button
            key={variable.id}
            type="button"
            className="email-editor-var"
            onPointerDown={(event) =>
              beginDrag(event, {
                kind: 'field',
                variableId: variable.id,
                fromIndex: -1,
                label: variable.label,
              })
            }
            onClick={() => {
              if (skipClickRef.current) {
                skipClickRef.current = false
                return
              }
              insertVariable(variable.id)
            }}
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
        <span>Inbox</span>
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
          <p className="email-device__from">{SAMPLE_EMAIL_VARS.business_name}</p>
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
            <p>Drag each line, card, or button into place</p>
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
          className={`email-editor-workspace is-${mobilePane}${drag?.active ? ' is-dragging' : ''}`}
        >
          {palette}

          <div className="email-editor-stage" ref={stageRef}>
            <div className="email-page">
              <div className="email-page__sheet">
                {blocks.map((block, index) => (
                  <div key={block.id}>
                    <div
                      className={
                        dropIndex === index && drag?.active
                          ? 'email-slot is-active'
                          : 'email-slot'
                      }
                    />
                    <div
                      className={
                        drag?.active && drag.id === block.id
                          ? 'email-item is-source'
                          : focusedId === block.id
                            ? 'email-item is-focused'
                            : 'email-item'
                      }
                      data-item-index={index}
                    >
                      <button
                        type="button"
                        className="email-item__grab"
                        aria-label={`Drag ${ITEM_LABEL[block.type]}`}
                        onPointerDown={(event) =>
                          beginDrag(event, {
                            kind: 'reorder',
                            id: block.id,
                            fromIndex: index,
                            label: ITEM_LABEL[block.type],
                          })
                        }
                      >
                        <Glyph path="M10 5v14M14 5v14" />
                      </button>
                      <CanvasItem
                        block={block}
                        selected={focusedId === block.id}
                        dragging={Boolean(drag?.active)}
                        onFocus={() => setFocusedId(block.id)}
                        onChange={(nextHtml) =>
                          updateBlockHtml(block.id, nextHtml)
                        }
                      />
                      <div className="email-item__ops">
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
                          aria-label="Delete item"
                          onClick={() => removeBlock(block.id)}
                        >
                          <Glyph path="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <div
                  className={
                    dropIndex === blocks.length && drag?.active
                      ? 'email-slot is-active'
                      : 'email-slot'
                  }
                />
              </div>
            </div>
          </div>

          {previewPane}
        </div>

        {drag?.active ? (
          <div
            className="email-drag-ghost"
            style={{ top: drag.y, left: drag.x }}
          >
            {drag.label}
          </div>
        ) : null}

        <nav className="email-mobile-panes" aria-label="Designer views">
          <button
            type="button"
            className={mobilePane === 'blocks' ? 'is-active' : ''}
            onClick={() => setMobilePane('blocks')}
          >
            <Glyph path="M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z" />
            Items
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
