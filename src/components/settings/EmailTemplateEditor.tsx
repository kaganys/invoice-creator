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
  art: EmailCanvasBlockType | EmailBlockId | 'field'
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

const HARD_BOX = new Set<EmailCanvasBlockType>([
  'button',
  'divider',
  'spacer',
])

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

function Art({ kind }: { kind: string }) {
  return <span className={`email-art email-art--${kind}`} aria-hidden="true" />
}

function TileStage({
  block,
  locked,
  onFocus,
  onChange,
}: {
  block: EmailCanvasBlock
  locked: boolean
  onFocus: () => void
  onChange: (html: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current && block.type !== 'button' && block.type !== 'divider' && block.type !== 'spacer') {
      ref.current.innerHTML = block.html || '<p></p>'
    }
  }, [block.id, block.type])

  if (block.type === 'button') {
    return (
      <div className="email-visual email-visual--button">
        <span className="email-cta">Pay Online</span>
      </div>
    )
  }
  if (block.type === 'divider') {
    return <div className="email-visual email-visual--rule" />
  }
  if (block.type === 'spacer') {
    return <div className="email-visual email-visual--spacer" />
  }

  return (
    <div
      ref={ref}
      className={`email-visual email-visual--${block.type}`}
      contentEditable={!locked}
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
    const active = session.active || dist > 5
    const next = { ...session, active, x: event.clientX, y: event.clientY }
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
    if (
      session.kind === 'reorder' &&
      session.art &&
      HARD_BOX.has(session.art as EmailCanvasBlockType)
    ) {
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

  return (
    <div className="email-studio-root">
      <div
        ref={dialogRef}
        className={`email-studio is-pane-${mobilePane}${drag?.active ? ' is-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-editor-title"
        tabIndex={-1}
      >
        <header className="email-studio__top">
          <h2 id="email-editor-title">Studio</h2>
          <div className="email-studio__top-actions">
            <button type="button" className="email-ghost-btn" onClick={onClose}>
              Close
            </button>
            <button type="button" className="email-gold-btn" onClick={save}>
              Use this email
            </button>
          </div>
        </header>

        <div className="email-studio__work">
          <aside className="email-kit">
            <p className="email-kit__kicker">Pieces</p>
            <div className="email-kit__grid">
              {PALETTE_BLOCKS.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className="email-kit__card"
                  onPointerDown={(event) =>
                    beginDrag(event, {
                      kind: 'palette',
                      type: block.id,
                      fromIndex: -1,
                      label: ITEM_LABEL[block.id],
                      art: block.id,
                    })
                  }
                  onClick={() => {
                    if (skipClickRef.current) {
                      skipClickRef.current = false
                      return
                    }
                    insertBlockAt(block.id, insertIndex())
                    setMobilePane('write')
                  }}
                >
                  <Art kind={block.id} />
                  <span>{ITEM_LABEL[block.id]}</span>
                </button>
              ))}
            </div>
            <p className="email-kit__kicker">Fields</p>
            <div className="email-kit__fields">
              {EMAIL_VARIABLES.map((variable) => (
                <button
                  key={variable.id}
                  type="button"
                  className="email-chip"
                  onPointerDown={(event) =>
                    beginDrag(event, {
                      kind: 'field',
                      variableId: variable.id,
                      fromIndex: -1,
                      label: variable.label,
                      art: 'field',
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
              ))}
            </div>
          </aside>

          <section className="email-board" ref={stageRef}>
            <div className="email-board__tools" role="toolbar" aria-label="Format">
              <button type="button" onClick={() => runCommand('bold')}>
                B
              </button>
              <button type="button" onClick={() => runCommand('italic')}>
                <em>I</em>
              </button>
              <button type="button" onClick={() => runCommand('underline')}>
                <span className="email-u">U</span>
              </button>
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
                <Glyph path="M10 13a5 5 0 0 0 7.07 0l1.4-1.4a5 5 0 1 0-7.07-7.07L10 6M14 11a5 5 0 0 0-7.07 0L5.5 12.4a5 5 0 0 0 7.07 7.07L14 18" />
              </button>
              <input
                className="email-board__subject"
                value={draftSubject}
                onChange={(event) => setDraftSubject(event.target.value)}
                aria-label="Subject"
              />
            </div>

            <div className="email-artboard">
              {blocks.map((block, index) => (
                <div key={block.id}>
                  <div
                    className={
                      dropIndex === index && drag?.active
                        ? 'email-drop is-on'
                        : 'email-drop'
                    }
                  />
                  <article
                    className={[
                      'email-tile',
                      `email-tile--${block.type}`,
                      HARD_BOX.has(block.type) ? 'is-box' : '',
                      focusedId === block.id ? 'is-on' : '',
                      drag?.active && drag.id === block.id ? 'is-lift' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-item-index={index}
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement
                      if (target.closest('.email-tile__x')) {
                        return
                      }
                      if (
                        target.closest('[contenteditable="true"]') &&
                        !HARD_BOX.has(block.type)
                      ) {
                        return
                      }
                      beginDrag(event, {
                        kind: 'reorder',
                        id: block.id,
                        fromIndex: index,
                        label: ITEM_LABEL[block.type],
                        art: block.type,
                      })
                    }}
                    onClick={() => setFocusedId(block.id)}
                  >
                    <header className="email-tile__bar">
                      <span>{ITEM_LABEL[block.type]}</span>
                      <button
                        type="button"
                        className="email-tile__x"
                        aria-label="Remove"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeBlock(block.id)
                        }}
                      >
                        <IconX />
                      </button>
                    </header>
                    <TileStage
                      block={block}
                      locked={Boolean(drag?.active)}
                      onFocus={() => setFocusedId(block.id)}
                      onChange={(nextHtml) => updateBlockHtml(block.id, nextHtml)}
                    />
                  </article>
                </div>
              ))}
              <div
                className={
                  dropIndex === blocks.length && drag?.active
                    ? 'email-drop is-on'
                    : 'email-drop'
                }
              />
            </div>
          </section>

          <aside className="email-live">
            <p>
              <IconEye /> Live
            </p>
            <div className="email-phone">
              <iframe title="Live preview" srcDoc={preview.html} />
            </div>
          </aside>
        </div>

        {drag?.active ? (
          <div
            className="email-ghost"
            style={{ top: drag.y, left: drag.x }}
          >
            <Art kind={drag.art} />
            <span>{drag.label}</span>
          </div>
        ) : null}

        <nav className="email-studio__tabs">
          <button
            type="button"
            className={mobilePane === 'blocks' ? 'is-active' : ''}
            onClick={() => setMobilePane('blocks')}
          >
            Pieces
          </button>
          <button
            type="button"
            className={mobilePane === 'write' ? 'is-active' : ''}
            onClick={() => setMobilePane('write')}
          >
            Canvas
          </button>
          <button
            type="button"
            className={mobilePane === 'preview' ? 'is-active' : ''}
            onClick={() => setMobilePane('preview')}
          >
            Live
          </button>
        </nav>
      </div>
    </div>
  )
}
