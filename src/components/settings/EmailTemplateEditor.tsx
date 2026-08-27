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
} from '../../invoice/emailCanvas.ts'
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

type RibbonTab = 'home' | 'insert'
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
      className={
        selected
          ? 'email-doc-block is-selected'
          : 'email-doc-block'
      }
      data-block-id={block.id}
    >
      <button
        type="button"
        className="email-doc-block__handle"
        aria-label={`Drag ${block.type} block`}
        title="Drag to move"
        onPointerDown={onPointerDragStart}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      <div
        ref={ref}
        className="email-doc-block__body"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={`${block.type} block`}
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
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>('home')
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
    setDraftSubject(subject)
    const parsed = parseEmailHtmlToBlocks(html)
    setBlocks(parsed.length > 0 ? parsed : defaultCanvasBlocks())
    setFocusedId(parsed[0]?.id ?? null)
    setMobilePane('write')
    setRibbonTab('home')
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

  const palette = (
    <aside className="email-editor-palette">
      <p className="email-editor-palette__title">Styles</p>
      <p className="email-editor-palette__hint">
        Drag onto the page, or tap to add at the bottom.
      </p>
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
            <span className="email-block-card__label">{block.label}</span>
            <span className="email-block-card__hint">{block.hint}</span>
          </button>
        ))}
      </div>
      <p className="email-editor-palette__title">Merge fields</p>
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
        <span>Print layout</span>
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
        className="email-editor-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-editor-title"
        tabIndex={-1}
      >
        <header className="email-word-titlebar">
          <div className="email-word-titlebar__doc">
            <span className="email-word-titlebar__icon" aria-hidden="true">
              W
            </span>
            <div>
              <h2 id="email-editor-title">Invoice email</h2>
              <p>Word-style designer · drag blocks onto the page</p>
            </div>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <IconX />
            Close
          </button>
        </header>

        <div className="email-word-tabs" role="tablist" aria-label="Ribbon">
          <button
            type="button"
            role="tab"
            aria-selected={ribbonTab === 'home'}
            className={
              ribbonTab === 'home'
                ? 'email-word-tab is-active'
                : 'email-word-tab'
            }
            onClick={() => setRibbonTab('home')}
          >
            Home
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ribbonTab === 'insert'}
            className={
              ribbonTab === 'insert'
                ? 'email-word-tab is-active'
                : 'email-word-tab'
            }
            onClick={() => setRibbonTab('insert')}
          >
            Insert
          </button>
        </div>

        {ribbonTab === 'home' ? (
          <div className="email-ribbon" role="toolbar" aria-label="Home">
            <div className="email-ribbon__group">
              <span className="email-ribbon__label">Clipboard</span>
              <div className="email-ribbon__tools">
                <ToolButton label="Undo" onClick={() => format('undo')}>
                  ↺
                </ToolButton>
                <ToolButton label="Redo" onClick={() => format('redo')}>
                  ↻
                </ToolButton>
              </div>
            </div>
            <div className="email-ribbon__group">
              <span className="email-ribbon__label">Font</span>
              <div className="email-ribbon__tools">
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
                <ToolButton
                  label="Clear formatting"
                  onClick={() => format('removeFormat')}
                >
                  ✕
                </ToolButton>
              </div>
            </div>
            <div className="email-ribbon__group">
              <span className="email-ribbon__label">Paragraph</span>
              <div className="email-ribbon__tools">
                <ToolButton
                  label="Heading"
                  onClick={() => format('formatBlock', 'h2')}
                >
                  Aa
                </ToolButton>
                <ToolButton
                  label="Normal"
                  onClick={() => format('formatBlock', 'p')}
                >
                  ¶
                </ToolButton>
                <ToolButton
                  label="Bulleted list"
                  onClick={() => format('insertUnorderedList')}
                >
                  ••
                </ToolButton>
                <ToolButton
                  label="Numbered list"
                  onClick={() => format('insertOrderedList')}
                >
                  1.
                </ToolButton>
                <ToolButton
                  label="Align left"
                  onClick={() => format('justifyLeft')}
                >
                  ⇤
                </ToolButton>
                <ToolButton
                  label="Align center"
                  onClick={() => format('justifyCenter')}
                >
                  ≡
                </ToolButton>
                <ToolButton
                  label="Align right"
                  onClick={() => format('justifyRight')}
                >
                  ⇥
                </ToolButton>
              </div>
            </div>
            <div className="email-ribbon__group">
              <span className="email-ribbon__label">Insert</span>
              <div className="email-ribbon__tools">
                <ToolButton label="Link" onClick={addLink}>
                  ↗
                </ToolButton>
              </div>
            </div>
          </div>
        ) : (
          <div className="email-ribbon" role="toolbar" aria-label="Insert">
            <div className="email-ribbon__group email-ribbon__group--grow">
              <span className="email-ribbon__label">Blocks</span>
              <p className="email-ribbon__copy">
                Drag a style from the left onto the page, or tap one to append.
              </p>
            </div>
            <div className="email-ribbon__group">
              <span className="email-ribbon__label">Merge fields</span>
              <div className="email-ribbon__tools email-ribbon__tools--wrap">
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
            </div>
          </div>
        )}

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

        <div
          className={`email-editor-workspace is-${mobilePane}`}
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
            <div className="email-word-page">
              <div className="email-word-ruler" aria-hidden="true">
                {Array.from({ length: 9 }, (_, index) => (
                  <span key={index}>{index}</span>
                ))}
              </div>
              <div className="email-word-page__sheet">
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
                      <span>{block.type === 'html' ? 'Text' : block.type}</span>
                      <div className="email-doc-block__actions">
                        <button
                          type="button"
                          className="email-mini"
                          disabled={index === 0}
                          aria-label="Move up"
                          onClick={() => shiftBlock(block.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="email-mini"
                          disabled={index === blocks.length - 1}
                          aria-label="Move down"
                          onClick={() => shiftBlock(block.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="email-mini"
                          aria-label="Delete block"
                          onClick={() => removeBlock(block.id)}
                        >
                          ✕
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
                        event.dataTransfer.setData('text/plain', `reorder:${block.id}`)
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
            Blocks
          </button>
          <button
            type="button"
            className={mobilePane === 'write' ? 'is-active' : ''}
            onClick={() => setMobilePane('write')}
          >
            Page
          </button>
          <button
            type="button"
            className={mobilePane === 'preview' ? 'is-active' : ''}
            onClick={() => setMobilePane('preview')}
          >
            Preview
          </button>
        </nav>

        <footer className="email-editor-modal__footer">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              const next = defaultCanvasBlocks()
              setBlocks(next)
              setFocusedId(next[0]?.id ?? null)
            }}
          >
            Reset layout
          </button>
          <div className="email-editor-modal__footer-end">
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
          </div>
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
        const type = (event.dataTransfer.getData(
          'application/x-email-block',
        ) ||
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
