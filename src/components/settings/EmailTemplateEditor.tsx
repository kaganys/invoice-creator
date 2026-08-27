import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
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
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

function Dots() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">
      <circle cx="2" cy="2" r="1" fill="currentColor" />
      <circle cx="6" cy="2" r="1" fill="currentColor" />
      <circle cx="2" cy="7" r="1" fill="currentColor" />
      <circle cx="6" cy="7" r="1" fill="currentColor" />
      <circle cx="2" cy="12" r="1" fill="currentColor" />
      <circle cx="6" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}

function CanvasItem({
  block,
  dragging,
  onFocus,
  onChange,
}: {
  block: EmailCanvasBlock
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
      ref={ref}
      className="email-item__edit"
      contentEditable={!dragging}
      suppressContentEditableWarning
      role="textbox"
      aria-label={ITEM_LABEL[block.type]}
      onFocus={onFocus}
      onInput={() => onChange(ref.current?.innerHTML ?? '')}
    />
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
  const [mobilePane, setMobilePane] = useState<MobilePane>('write')
  const [previewing, setPreviewing] = useState(false)
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
    setPreviewing(false)
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

  function insertIndex(): number {
    const from = blocks.findIndex((block) => block.id === focusedId)
    return from >= 0 ? from + 1 : blocks.length
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
      setPreviewing(false)
      return
    }
    if (session.kind === 'field' && session.variableId) {
      insertFieldAt(session.variableId, at)
      setMobilePane('write')
      setPreviewing(false)
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
      applyDrag(session, dropIndexRef.current ?? readDropIndex(session.y))
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

  function save() {
    onApply({
      subject: draftSubject,
      html: serializeEmailBlocks(blocks),
    })
  }

  const library = (
    <aside className="email-lib">
      <p className="email-lib__label">Add</p>
      <ul className="email-lib__list">
        {PALETTE_BLOCKS.map((block) => (
          <li key={block.id}>
            <button
              type="button"
              className="email-lib__row"
              onClick={() => {
                if (skipClickRef.current) {
                  skipClickRef.current = false
                  return
                }
                insertBlockAt(block.id, insertIndex())
                setMobilePane('write')
                setPreviewing(false)
              }}
            >
              <span
                className="email-lib__handle"
                onPointerDown={(event) =>
                  beginDrag(event, {
                    kind: 'palette',
                    type: block.id,
                    fromIndex: -1,
                    label: ITEM_LABEL[block.id],
                  })
                }
              >
                <Dots />
              </span>
              {ITEM_LABEL[block.id]}
            </button>
          </li>
        ))}
      </ul>
      <p className="email-lib__label">Fields</p>
      <ul className="email-lib__list">
        {EMAIL_VARIABLES.map((variable) => (
          <li key={variable.id}>
            <button
              type="button"
              className="email-lib__row"
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
                runCommand(
                  'insertHTML',
                  `&nbsp;${emailVariableChip(variable.id)}&nbsp;`,
                )
              }}
            >
              {variable.label}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="email-lib__reset"
        onClick={() => {
          const next = defaultCanvasBlocks()
          setBlocks(next)
          setFocusedId(next[0]?.id ?? null)
        }}
      >
        Start over
      </button>
    </aside>
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
        className={`email-desk is-pane-${mobilePane}${previewing ? ' is-previewing' : ''}${drag?.active ? ' is-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-editor-title"
        tabIndex={-1}
      >
        <header className="email-desk__bar">
          <h2 id="email-editor-title">Email</h2>
          <div className="email-desk__bar-actions">
            <button
              type="button"
              className={previewing ? 'email-text-btn is-on' : 'email-text-btn'}
              onClick={() => {
                setPreviewing((current) => !current)
                setMobilePane((current) =>
                  current === 'preview' ? 'write' : current,
                )
              }}
            >
              <IconEye />
              Preview
            </button>
            <button type="button" className="email-text-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="email-done" onClick={save}>
              Done
            </button>
          </div>
        </header>

        <div className="email-desk__body">
          {library}

          <div className="email-desk__stage" ref={stageRef}>
            {previewing ? (
              <div className="email-letter email-letter--preview">
                <iframe title="Email preview" srcDoc={preview.html} />
              </div>
            ) : (
              <div className="email-letter">
                <div className="email-letter__tools" role="toolbar" aria-label="Format">
                  <button type="button" onClick={() => runCommand('bold')} aria-label="Bold">
                    <strong>B</strong>
                  </button>
                  <button type="button" onClick={() => runCommand('italic')} aria-label="Italic">
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    onClick={() => runCommand('underline')}
                    aria-label="Underline"
                  >
                    <span className="email-u">U</span>
                  </button>
                  <i />
                  <button
                    type="button"
                    onClick={() => runCommand('insertUnorderedList')}
                    aria-label="List"
                  >
                    <Glyph path="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                  </button>
                  <button
                    type="button"
                    aria-label="Link"
                    onClick={() => {
                      const url = window.prompt('Link', 'https://')
                      if (url) {
                        runCommand('createLink', url)
                      }
                    }}
                  >
                    <Glyph path="M10 13a5 5 0 0 0 7.07 0l1.4-1.4a5 5 0 0 0-7.07-7.07L10 6M14 11a5 5 0 0 0-7.07 0L5.5 12.4a5 5 0 0 0 7.07 7.07L14 18" />
                  </button>
                </div>

                <label className="email-letter__subject" htmlFor="email-editor-subject">
                  <span>Subject</span>
                  <input
                    id="email-editor-subject"
                    value={draftSubject}
                    onChange={(event) => setDraftSubject(event.target.value)}
                  />
                </label>

                <div className="email-letter__body">
                  {blocks.map((block, index) => (
                    <div key={block.id}>
                      <div
                        className={
                          dropIndex === index && drag?.active
                            ? 'email-gap is-drop'
                            : 'email-gap'
                        }
                      >
                        <button
                          type="button"
                          className="email-gap__add"
                          aria-label="Add text here"
                          onClick={() => insertBlockAt('text', index)}
                        >
                          +
                        </button>
                      </div>
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
                          aria-label={`Move ${ITEM_LABEL[block.type]}`}
                          onPointerDown={(event) =>
                            beginDrag(event, {
                              kind: 'reorder',
                              id: block.id,
                              fromIndex: index,
                              label: ITEM_LABEL[block.type],
                            })
                          }
                        >
                          <Dots />
                        </button>
                        <CanvasItem
                          block={block}
                          dragging={Boolean(drag?.active)}
                          onFocus={() => setFocusedId(block.id)}
                          onChange={(nextHtml) =>
                            updateBlockHtml(block.id, nextHtml)
                          }
                        />
                        <button
                          type="button"
                          className="email-item__remove"
                          aria-label="Remove"
                          onClick={() => removeBlock(block.id)}
                        >
                          <IconX />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div
                    className={
                      dropIndex === blocks.length && drag?.active
                        ? 'email-gap is-drop'
                        : 'email-gap'
                    }
                  >
                    <button
                      type="button"
                      className="email-gap__add"
                      aria-label="Add text at the end"
                      onClick={() => insertBlockAt('text', blocks.length)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {drag?.active ? (
          <div
            className="email-drag-ghost"
            style={{ top: drag.y, left: drag.x }}
          >
            {drag.label}
          </div>
        ) : null}

        <nav className="email-desk__tabs" aria-label="Editor">
          <button
            type="button"
            className={mobilePane === 'blocks' ? 'is-active' : ''}
            onClick={() => {
              setMobilePane('blocks')
              setPreviewing(false)
            }}
          >
            Add
          </button>
          <button
            type="button"
            className={mobilePane === 'write' && !previewing ? 'is-active' : ''}
            onClick={() => {
              setMobilePane('write')
              setPreviewing(false)
            }}
          >
            Letter
          </button>
          <button
            type="button"
            className={previewing || mobilePane === 'preview' ? 'is-active' : ''}
            onClick={() => {
              setMobilePane('preview')
              setPreviewing(true)
            }}
          >
            Preview
          </button>
        </nav>
      </div>
    </div>
  )
}
