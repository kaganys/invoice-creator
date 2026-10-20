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
  emailSpacingFromHtml,
  EMPTY_METRICS,
  LINE_HEIGHTS,
  metricsActive,
  parseLineHeight,
  parseSpaceStep,
  SPACE_STEPS,
  spaceCss,
  type EmailSpacing,
  type LineHeightChoice,
  type ParagraphMetrics,
  type SpaceStep,
} from '../../invoice/emailSpacing.ts'
import { insertionIndex } from '../../invoice/emailArrange.ts'
import { SAMPLE_EMAIL_VARS } from '../../invoice/emailHtml.ts'
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
  { kind: 'button', label: 'Pay online button' },
  { kind: 'amount', label: 'Amount due box' },
  { kind: 'link', label: 'Link fallback' },
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

function lineHeightLabel(choice: LineHeightChoice): string {
  if (choice === '1') {
    return '1.0'
  }
  if (choice === '2') {
    return '2.0'
  }
  return choice
}

const TEXT_COLORS = [
  { value: '#2a2a26', label: 'Ink' },
  { value: '#d9734e', label: 'Coral' },
  { value: '#2f8f8a', label: 'Teal' },
  { value: '#1f4d3f', label: 'Green' },
] as const

const SPACE_PT: Record<SpaceStep, string> = {
  none: '0 pt',
  small: '6 pt',
  normal: '12 pt',
  large: '21 pt',
}

type CaretMark = { host: 'subject' | 'letter'; left: number; top: number; height: number }

function blockElements(sheet: HTMLElement): HTMLElement[] {
  return [...sheet.children].filter((node): node is HTMLElement => {
    return node instanceof HTMLElement && node.getAttribute('data-email-part') !== 'spacing'
  })
}

function editableHtml(sheet: HTMLElement): string {
  const clone = sheet.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-email-chrome]').forEach((node) => node.remove())
  clone.querySelectorAll('.is-ghost').forEach((node) => node.classList.remove('is-ghost'))
  return clone.innerHTML
}

function decorateSheet(sheet: HTMLElement) {
  for (const child of [...sheet.children]) {
    if (!(child instanceof HTMLElement) || child.getAttribute('data-email-part') === 'spacing') {
      continue
    }
    if (!child.querySelector(':scope > [data-email-chrome="outline"]')) {
      const outline = document.createElement('span')
      outline.dataset.emailChrome = 'outline'
      outline.className = 'email-hovline'
      outline.contentEditable = 'false'
      child.append(outline)
    }
    if (!child.querySelector(':scope > [data-email-chrome="grip"]')) {
      const grip = document.createElement('button')
      grip.type = 'button'
      grip.dataset.emailChrome = 'grip'
      grip.className = 'email-grip'
      grip.contentEditable = 'false'
      grip.setAttribute('aria-label', 'Drag to reorder')
      grip.tabIndex = -1
      grip.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>'
      child.append(grip)
    }
  }
}

function characterBefore(range: Range): string {
  const node = range.startContainer
  if (node.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
    return (node.textContent ?? '').charAt(range.startOffset - 1)
  }
  const sibling =
    node.nodeType === Node.TEXT_NODE
      ? node.previousSibling
      : node.childNodes[range.startOffset - 1] ?? null
  return (sibling?.textContent ?? '').slice(-1)
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null
    caretPositionFromPoint?: (
      clientX: number,
      clientY: number,
    ) => { offsetNode: Node; offset: number } | null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y)
  }
  const position = doc.caretPositionFromPoint?.(x, y)
  if (!position) {
    return null
  }
  const range = document.createRange()
  range.setStart(position.offsetNode, position.offset)
  range.collapse(true)
  return range
}

function chipIdFromDrop(transfer: DataTransfer): EmailVariableId | null {
  const custom = transfer.getData('application/x-email-var')
  const plain = transfer.getData('text/plain')
  const raw = custom || (plain.startsWith('email-var:') ? plain.slice('email-var:'.length) : '')
  return EMAIL_VARIABLES.some((variable) => variable.id === raw) ? (raw as EmailVariableId) : null
}

function sampleValue(id: EmailVariableId): string {
  if (id === 'payment_url') {
    return 'pay.example.com/…'
  }
  if (id === 'payment_memo') {
    return 'Memo line'
  }
  return SAMPLE_EMAIL_VARS[id]
}

function nudgeStep(current: SpaceStep | null, fallback: SpaceStep, delta: number): SpaceStep {
  const index = SPACE_STEPS.indexOf(current ?? fallback)
  const next = Math.min(SPACE_STEPS.length - 1, Math.max(0, index + delta))
  return SPACE_STEPS[next]
}

function ToolButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={pressed ? 'email-editor__tool is-on' : 'email-editor__tool'}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
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

const SPACING_LOCK =
  '[data-email-part="header"], [data-email-part="amount"], [data-email-part="button"], [data-email-part="link"], [data-email-part="attachment"], [data-email-part="footer"], [data-email-part="spacing"]'

function spacingLocked(node: HTMLElement): boolean {
  return Boolean(node.closest(SPACING_LOCK))
}

function blockFromRange(sheet: HTMLElement, range: Range | null): HTMLElement | null {
  const node = range?.startContainer ?? null
  if (!node || !sheet.contains(node)) {
    return null
  }
  const element = node instanceof Element ? node : node.parentElement
  const block = element?.closest('li, p, h2, ul, ol')
  if (!(block instanceof HTMLElement) || !sheet.contains(block) || spacingLocked(block)) {
    return null
  }
  return block
}

function metricsFromElement(block: HTMLElement): ParagraphMetrics {
  return {
    lineHeight: parseLineHeight(block.getAttribute('data-line-height')),
    before: parseSpaceStep(block.getAttribute('data-space-before')),
    after: parseSpaceStep(block.getAttribute('data-space-after')),
  }
}

function setMetricAttr(node: HTMLElement, name: string, value: string | null) {
  if (!value) {
    node.removeAttribute(name)
    return
  }
  node.setAttribute(name, value)
}

function syncSheetSpacing(sheet: HTMLElement) {
  const email = emailSpacingFromHtml(sheet.innerHTML)
  sheet.style.setProperty('--email-line', email.lineHeight ?? '1.55')
  sheet.style.setProperty('--email-before', email.before ? spaceCss(email.before) : '0px')
  sheet.style.setProperty('--email-after', email.after ? spaceCss(email.after) : '16px')
  for (const block of sheet.querySelectorAll('p, h2, ul, ol, li')) {
    if (!(block instanceof HTMLElement) || spacingLocked(block)) {
      continue
    }
    const metrics = metricsFromElement(block)
    block.style.margin = ''
    block.style.lineHeight = metrics.lineHeight ?? ''
    block.style.marginTop = metrics.before ? spaceCss(metrics.before) : ''
    block.style.marginBottom = metrics.after ? spaceCss(metrics.after) : ''
  }
}

function writeEmailSpacing(sheet: HTMLElement, spacing: EmailSpacing) {
  const current = sheet.querySelector('[data-email-part="spacing"]')
  if (!metricsActive(spacing)) {
    current?.remove()
    return
  }
  const node = current instanceof HTMLElement ? current : document.createElement('div')
  node.setAttribute('data-email-part', 'spacing')
  node.setAttribute('contenteditable', 'false')
  setMetricAttr(node, 'data-line-height', spacing.lineHeight)
  setMetricAttr(node, 'data-space-before', spacing.before)
  setMetricAttr(node, 'data-space-after', spacing.after)
  if (!current) {
    sheet.prepend(node)
  }
}

export function EmailMessageEditor({
  subject,
  html,
  subjectPreview,
  disabled,
  brand,
  envelope,
  resetSignal = 0,
  onChange,
}: {
  subject: string
  html: string
  subjectPreview?: string
  disabled?: boolean
  brand?: EmailEditorBrand
  envelope?: {
    fromName: string
    replyTo: string
    onFromName: (value: string) => void
    onReplyTo: (value: string) => void
  }
  resetSignal?: number
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
  const [insertOpen, setInsertOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [spacingOpen, setSpacingOpen] = useState(false)
  const [paragraphMetrics, setParagraphMetrics] = useState<ParagraphMetrics>(EMPTY_METRICS)
  const [emailMetrics, setEmailMetrics] = useState<EmailSpacing>(EMPTY_METRICS)
  const [hasParagraph, setHasParagraph] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [styleOpen, setStyleOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [styleName, setStyleName] = useState('Paragraph')
  const [ink, setInk] = useState<(typeof TEXT_COLORS)[number]['value']>('#d9734e')
  const [marks, setMarks] = useState({ bold: false, italic: false, underline: false })
  const [insertLine, setInsertLine] = useState<number | null>(null)
  const [caret, setCaret] = useState<CaretMark | null>(null)
  const subjectRef = useRef<HTMLDivElement>(null)
  const subjectWrapRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const subjectValue = useRef(subject)
  const bodyValue = useRef(html.trim() ? editorHtmlToDocument(documentToEditorHtml(html, brandAssets)) : '')
  const brandRef = useRef(brandAssets)
  const emitted = useRef('')
  const history = useRef<Snapshot[]>([])
  const index = useRef(0)
  const skipHistory = useRef(false)
  const insertRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const dropRange = useRef<Range | null>(null)
  const draggingChip = useRef<EmailVariableId | null>(null)
  const chipDropped = useRef(false)
  const dragTo = useRef<number | null>(null)
  const emailSpacingRef = useRef<EmailSpacing>(emailSpacingFromHtml(html))
  const active = useRef<'subject' | 'letter' | null>(null)
  const resetSeen = useRef(resetSignal)
  const commitSheetRef = useRef<() => void>(() => {})
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
    emailSpacingRef.current = emailSpacingFromHtml(canonical)
    setEmailMetrics(emailSpacingRef.current)
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
    syncSheetSpacing(node)
    decorateSheet(node)
  }, [revision, seed])

  useEffect(() => {
    const node = sheetRef.current
    if (!node || document.activeElement === node) {
      return
    }
    const next = documentToEditorHtml(bodyValue.current, brandAssets)
    if (editableHtml(node) !== next) {
      node.innerHTML = next
      syncSheetSpacing(node)
      decorateSheet(node)
    }
  }, [brandAssets.logoUrl, brandAssets.wordmarkUrl])

  useEffect(() => {
    function remember() {
      const sheet = sheetRef.current
      const selection = window.getSelection()
      if (!sheet || !selection || selection.rangeCount === 0) {
        return
      }
      const range = selection.getRangeAt(0)
      if (!sheet.contains(range.startContainer)) {
        return
      }
      savedRange.current = range.cloneRange()
      const block = blockFromRange(sheet, range)
      setHasParagraph(Boolean(block))
      setParagraphMetrics(block ? metricsFromElement(block) : { ...EMPTY_METRICS })
      const element =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement
      setStyleName(element?.closest('h2') ? 'Heading' : 'Paragraph')
      try {
        setMarks({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
        })
      } catch {
        setMarks({ bold: false, italic: false, underline: false })
      }
    }
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
  }, [])

  useEffect(() => {
    if (!insertOpen && !styleOpen && !colorOpen && !spacingOpen && !linkOpen) {
      return
    }
    function onPointerDown(event: MouseEvent) {
      if (barRef.current?.contains(event.target as Node)) {
        return
      }
      setInsertOpen(false)
      setStyleOpen(false)
      setColorOpen(false)
      setSpacingOpen(false)
      setLinkOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setInsertOpen(false)
        setStyleOpen(false)
        setColorOpen(false)
        setSpacingOpen(false)
        setLinkOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [insertOpen, styleOpen, colorOpen, spacingOpen, linkOpen])

  function commitSubject(editorHtml: string, record = true) {
    const nextSubject = editorHtmlToSubject(editorHtml)
    subjectValue.current = nextSubject
    publish(nextSubject, bodyValue.current, record)
  }

  function commitSheet(record = true) {
    const sheet = sheetRef.current
    if (sheet) {
      writeEmailSpacing(sheet, emailSpacingRef.current)
    }
    const nextHtml = editorHtmlToDocument(sheet ? editableHtml(sheet) : '')
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
      decorateSheet(node)
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
      decorateSheet(node)
    }
    setInsertOpen(false)
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
    decorateSheet(sheet)
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

  useEffect(() => {
    if (resetSignal === resetSeen.current) {
      return
    }
    resetSeen.current = resetSignal
    resetTemplate()
  }, [resetSignal])

  function healSheet() {
    const node = sheetRef.current
    if (!node) {
      return
    }
    const current = editableHtml(node)
    const canonical = editorHtmlToDocument(current)
    const healed = documentToEditorHtml(canonical, brandRef.current)
    if (current !== healed) {
      node.innerHTML = healed
      syncSheetSpacing(node)
    }
    decorateSheet(node)
  }

  function applyParagraphMetric(
    key: 'lineHeight' | 'before' | 'after',
    value: string,
  ) {
    const sheet = sheetRef.current
    if (!sheet) {
      return
    }
    const block = blockFromRange(sheet, savedRange.current)
    if (!block) {
      return
    }
    const attr =
      key === 'lineHeight'
        ? 'data-line-height'
        : key === 'before'
          ? 'data-space-before'
          : 'data-space-after'
    const parsed =
      key === 'lineHeight' ? parseLineHeight(value) : parseSpaceStep(value)
    setMetricAttr(block, attr, value ? parsed : null)
    syncSheetSpacing(sheet)
    setParagraphMetrics(metricsFromElement(block))
    commitSheet()
  }

  function applyEmailMetric(key: 'lineHeight' | 'before' | 'after', value: string) {
    const sheet = sheetRef.current
    if (!sheet) {
      return
    }
    const next: EmailSpacing = {
      ...emailSpacingRef.current,
      [key]: key === 'lineHeight' ? parseLineHeight(value) : parseSpaceStep(value),
    }
    emailSpacingRef.current = next
    writeEmailSpacing(sheet, next)
    syncSheetSpacing(sheet)
    setEmailMetrics(next)
    commitSheet()
  }

  commitSheetRef.current = commitSheet

  function restoreSheetRange() {
    const sheet = sheetRef.current
    const range = savedRange.current
    if (!sheet) {
      return
    }
    sheet.focus()
    if (!range) {
      return
    }
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  function applyBlock(tag: 'p' | 'h2') {
    restoreSheetRange()
    document.execCommand('formatBlock', false, tag)
    commitSheet()
    const sheet = sheetRef.current
    if (sheet) {
      decorateSheet(sheet)
    }
    setStyleName(tag === 'h2' ? 'Heading' : 'Paragraph')
    setStyleOpen(false)
  }

  function applyColor(color: (typeof TEXT_COLORS)[number]['value']) {
    restoreSheetRange()
    document.execCommand('foreColor', false, color)
    setInk(color)
    commitSheet()
    const sheet = sheetRef.current
    if (sheet) {
      decorateSheet(sheet)
    }
    setColorOpen(false)
  }

  function shownLine(): string {
    const choice = (hasParagraph ? paragraphMetrics.lineHeight : null) ?? emailMetrics.lineHeight
    return choice ? lineHeightLabel(choice) : '1.55'
  }

  function shownPoints(key: 'before' | 'after'): string {
    const choice = (hasParagraph ? paragraphMetrics[key] : null) ?? emailMetrics[key]
    const step = choice ?? (key === 'after' ? 'normal' : 'none')
    return SPACE_PT[step].replace(' pt', '')
  }

  function onSheetPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) {
      return
    }
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    const grip = target.closest('[data-email-chrome="grip"]')
    if (!grip) {
      return
    }
    event.preventDefault()
    const sheet = sheetRef.current
    const page = pageRef.current
    const block = grip.parentElement
    if (!sheet || !page || !(block instanceof HTMLElement)) {
      return
    }
    const from = blockElements(sheet).indexOf(block)
    if (from < 0) {
      return
    }
    block.classList.add('is-ghost')
    dragTo.current = from
    const move = (pointer: PointerEvent) => {
      const blocks = blockElements(sheet)
      const to = insertionIndex(
        blocks.map((item) => {
          const rect = item.getBoundingClientRect()
          return rect.top + rect.height / 2
        }),
        pointer.clientY,
      )
      dragTo.current = to
      const pageRect = page.getBoundingClientRect()
      const edge =
        to <= 0 ? blocks[0] : to >= blocks.length ? blocks[blocks.length - 1] : blocks[to - 1]
      if (!edge) {
        setInsertLine(null)
        return
      }
      const rect = edge.getBoundingClientRect()
      const anchor = to <= 0 ? rect.top : rect.bottom
      setInsertLine(anchor - pageRect.top + page.scrollTop + (to <= 0 ? -6 : 3))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      block.classList.remove('is-ghost')
      setInsertLine(null)
      const to = dragTo.current
      dragTo.current = null
      if (to == null || to === from || to === from + 1) {
        return
      }
      const blocks = blockElements(sheet)
      const node = blocks[from]
      if (!node) {
        return
      }
      sheet.insertBefore(node, blocks[to] ?? null)
      commitSheetRef.current()
      decorateSheet(sheet)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function placeDraggedChip(host: 'subject' | 'letter', id: EmailVariableId) {
    const node = host === 'subject' ? subjectRef.current : sheetRef.current
    const range = dropRange.current
    const variable = EMAIL_VARIABLES.find((item) => item.id === id)
    if (!node || !variable) {
      return
    }
    if (!range || !node.contains(range.startContainer)) {
      active.current = host
      insertVariable(id)
      return
    }
    range.deleteContents()
    const chip = document.createElement('span')
    chip.dataset.emailVar = id
    chip.contentEditable = 'false'
    chip.textContent = variable.label
    const previous = characterBefore(range)
    range.insertNode(chip)
    if (previous && !/\s/.test(previous)) {
      chip.before(document.createTextNode(' '))
    }
    if (host === 'subject') {
      commitSubject(node.innerHTML)
    } else {
      commitSheet()
      decorateSheet(node)
    }
  }

  function onChipDragStart(event: React.DragEvent<HTMLElement>, id: EmailVariableId) {
    draggingChip.current = id
    chipDropped.current = false
    event.dataTransfer.setData('application/x-email-var', id)
    event.dataTransfer.setData('text/plain', `email-var:${id}`)
    event.dataTransfer.effectAllowed = 'copy'
  }

  function finishChipDrag() {
    const id = draggingChip.current
    const inSubject = Boolean(
      dropRange.current && subjectRef.current?.contains(dropRange.current.startContainer),
    )
    if (!chipDropped.current && id) {
      placeDraggedChip(inSubject ? 'subject' : 'letter', id)
    }
    draggingChip.current = null
    chipDropped.current = false
    setCaret(null)
  }

  function onChipDrop(event: React.DragEvent<HTMLElement>, host: 'subject' | 'letter') {
    event.preventDefault()
    const id = chipIdFromDrop(event.dataTransfer) ?? draggingChip.current
    if (!id) {
      setCaret(null)
      return
    }
    chipDropped.current = true
    draggingChip.current = null
    setCaret(null)
    placeDraggedChip(host, id)
  }

  function onChipOver(event: React.DragEvent<HTMLElement>, host: 'subject' | 'letter') {
    const types = [...event.dataTransfer.types]
    if (!types.includes('application/x-email-var') && !types.includes('text/plain')) {
      return
    }
    event.preventDefault()
    const root = host === 'letter' ? sheetRef.current : subjectRef.current
    const frame = host === 'letter' ? pageRef.current : subjectWrapRef.current
    if (!root || !frame) {
      return
    }
    const range = caretRangeFromPoint(event.clientX, event.clientY)
    if (!range || !root.contains(range.startContainer)) {
      setCaret(null)
      return
    }
    const owner =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement
    if (owner?.closest('[data-email-chrome], [data-email-part="spacing"]')) {
      setCaret(null)
      return
    }
    dropRange.current = range.cloneRange()
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    setCaret({
      host,
      left: rect.left - frameRect.left + (host === 'letter' ? frame.scrollLeft : 0),
      top: rect.top - frameRect.top + (host === 'letter' ? frame.scrollTop : 0),
      height: Math.max(rect.height, 16),
    })
  }

  function stepParagraph(key: 'before' | 'after', delta: number) {
    const fallback = key === 'after' ? 'normal' : 'none'
    applyParagraphMetric(key, nudgeStep(paragraphMetrics[key], fallback, delta))
  }

  function stepEmail(key: 'before' | 'after', delta: number) {
    const fallback = key === 'after' ? 'normal' : 'none'
    applyEmailMetric(key, nudgeStep(emailMetrics[key], fallback, delta))
  }

  const paragraphLine = paragraphMetrics.lineHeight
  const emailLine = emailMetrics.lineHeight

  return (
    <div className="email-editor">
      <div className="email-envelope">
        <label className="email-envelope__subject">
          <span>Subject</span>
          <div className="email-envelope__control" ref={subjectWrapRef}>
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
              onDragOver={(event) => onChipOver(event, 'subject')}
              onDrop={(event) => onChipDrop(event, 'subject')}
            />
            {caret?.host === 'subject' ? (
              <span
                className="email-dropcaret"
                style={{ left: caret.left, top: caret.top, height: caret.height }}
              />
            ) : null}
          </div>
        </label>
        {envelope ? (
          <>
            <label>
              <span>From name</span>
              <input
                className="field__input"
                value={envelope.fromName}
                disabled={disabled}
                onChange={(event) => envelope.onFromName(event.target.value)}
              />
            </label>
            <label>
              <span>Reply-to</span>
              <input
                className="field__input"
                type="email"
                value={envelope.replyTo}
                disabled={disabled}
                placeholder="Optional"
                onChange={(event) => envelope.onReplyTo(event.target.value)}
              />
            </label>
          </>
        ) : null}
      </div>
      {subjectPreview ? (
        <p className="email-editor__resolved">Reads as {subjectPreview}</p>
      ) : null}

      <div className="email-editor__bar" ref={barRef}>
        <div className="email-editor__toolbar" role="toolbar" aria-label="Formatting">
          <div className="email-editor__popwrap">
            <button
              type="button"
              className="email-editor__tool email-editor__tool--menu"
              aria-haspopup="menu"
              aria-expanded={styleOpen}
              disabled={disabled}
              onMouseDown={preventFocusLoss}
              onClick={() => {
                setStyleOpen((open) => !open)
                setInsertOpen(false)
                setColorOpen(false)
                setSpacingOpen(false)
                setLinkOpen(false)
              }}
            >
              {styleName} ▾
            </button>
            {styleOpen ? (
              <div className="email-pop email-pop--style" role="menu">
                <button type="button" role="menuitem" onMouseDown={preventFocusLoss} onClick={() => applyBlock('p')}>
                  Paragraph
                </button>
                <button type="button" role="menuitem" onMouseDown={preventFocusLoss} onClick={() => applyBlock('h2')}>
                  Heading
                </button>
              </div>
            ) : null}
          </div>
          <span className="email-editor__divider" aria-hidden="true" />
          <ToolButton label="Bold" pressed={marks.bold} disabled={disabled} onClick={() => runCommand('bold')}>
            <b>B</b>
          </ToolButton>
          <ToolButton label="Italic" pressed={marks.italic} disabled={disabled} onClick={() => runCommand('italic')}>
            <i>I</i>
          </ToolButton>
          <ToolButton
            label="Underline"
            pressed={marks.underline}
            disabled={disabled}
            onClick={() => runCommand('underline')}
          >
            <u>U</u>
          </ToolButton>
          <ToolButton
            label="Link"
            disabled={disabled}
            onClick={() => {
              setLinkOpen((open) => !open)
              setLinkError(null)
              setStyleOpen(false)
              setInsertOpen(false)
              setColorOpen(false)
              setSpacingOpen(false)
            }}
          >
            ↗ Link
          </ToolButton>
          <span className="email-editor__divider" aria-hidden="true" />
          <ToolButton label="Bulleted list" disabled={disabled} onClick={() => runCommand('insertUnorderedList')}>
            • List
          </ToolButton>
          <ToolButton label="Numbered list" disabled={disabled} onClick={() => runCommand('insertOrderedList')}>
            1. List
          </ToolButton>
          <span className="email-editor__divider" aria-hidden="true" />
          <ToolButton label="Align left" disabled={disabled} onClick={() => runCommand('justifyLeft')}>
            ⟸
          </ToolButton>
          <ToolButton label="Align center" disabled={disabled} onClick={() => runCommand('justifyCenter')}>
            ≡
          </ToolButton>
          <ToolButton label="Align right" disabled={disabled} onClick={() => runCommand('justifyRight')}>
            ⟹
          </ToolButton>
          <span className="email-editor__divider" aria-hidden="true" />
          <div className="email-editor__popwrap">
            <button
              type="button"
              className="email-editor__tool"
              aria-label="Text color"
              aria-expanded={colorOpen}
              disabled={disabled}
              onMouseDown={preventFocusLoss}
              onClick={() => {
                setColorOpen((open) => !open)
                setStyleOpen(false)
                setInsertOpen(false)
                setSpacingOpen(false)
                setLinkOpen(false)
              }}
            >
              A<span className="email-editor__swatch" style={{ background: ink }} />
            </button>
            {colorOpen ? (
              <div className="email-pop email-pop--color" role="menu" aria-label="Text color">
                {TEXT_COLORS.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={ink === choice.value}
                    onMouseDown={preventFocusLoss}
                    onClick={() => applyColor(choice.value)}
                  >
                    <i style={{ background: choice.value }} />
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={spacingOpen ? 'email-editor__tool is-on' : 'email-editor__tool'}
            aria-label="Line spacing"
            aria-expanded={spacingOpen}
            disabled={disabled}
            onMouseDown={preventFocusLoss}
            onClick={() => {
              setSpacingOpen((open) => !open)
              setStyleOpen(false)
              setInsertOpen(false)
              setColorOpen(false)
              setLinkOpen(false)
              const sheet = sheetRef.current
              if (sheet) {
                setEmailMetrics(emailSpacingFromHtml(sheet.innerHTML))
              }
            }}
          >
            ↕ {shownLine()}
          </button>
          <button
            type="button"
            className="email-editor__tool"
            aria-label="Paragraph spacing"
            disabled={disabled}
            onMouseDown={preventFocusLoss}
            onClick={() => {
              setSpacingOpen((open) => !open)
              setStyleOpen(false)
              setInsertOpen(false)
              setColorOpen(false)
              setLinkOpen(false)
            }}
          >
            ¶ {shownPoints('before')} / {shownPoints('after')}
          </button>
          <span className="email-editor__grow" />
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
          <div className="email-editor__popwrap" ref={insertRef}>
            <button
              type="button"
              className={insertOpen ? 'email-editor__insert is-open' : 'email-editor__insert'}
              aria-haspopup="menu"
              aria-expanded={insertOpen}
              disabled={disabled}
              onMouseDown={preventFocusLoss}
              onClick={() => {
                setInsertOpen((open) => !open)
                setStyleOpen(false)
                setColorOpen(false)
                setSpacingOpen(false)
                setLinkOpen(false)
              }}
            >
              + Insert ▾
            </button>
            {insertOpen ? (
              <div className="email-pop email-pop--insert" role="menu">
                <p className="email-pop__label">Merge fields</p>
                {EMAIL_VARIABLES.map((variable) => (
                  <button
                    key={variable.id}
                    type="button"
                    role="menuitem"
                    className="email-pop__row"
                    disabled={disabled}
                    onMouseDown={preventFocusLoss}
                    onClick={() => insertVariable(variable.id)}
                  >
                    <span className="email-chip">{variable.label}</span>
                    <em>{sampleValue(variable.id)}</em>
                  </button>
                ))}
                <p className="email-pop__label">Blocks</p>
                {INSERTS.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    role="menuitem"
                    className="email-pop__row"
                    disabled={disabled}
                    onMouseDown={preventFocusLoss}
                    onClick={() => insertPart(item.kind)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {linkOpen ? (
          <div className="email-pop email-pop--link">
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
        {spacingOpen ? (
          <div className="email-pop email-pop--spacing" role="group" aria-label="Line and paragraph spacing">
            <p className="email-pop__label">Line spacing</p>
            <div className="email-editor__segments" role="radiogroup" aria-label="Line spacing">
              {LINE_HEIGHTS.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={paragraphLine === choice}
                  className={paragraphLine === choice ? 'is-on' : undefined}
                  disabled={disabled || !hasParagraph}
                  onMouseDown={preventFocusLoss}
                  onClick={() => applyParagraphMetric('lineHeight', choice)}
                >
                  {lineHeightLabel(choice)}
                </button>
              ))}
            </div>
            <p className="email-pop__label">Paragraph spacing</p>
            <div className="email-editor__kv">
              <span>Before</span>
              <span className="email-editor__num">
                <button type="button" aria-label="Decrease space before" disabled={disabled || !hasParagraph} onMouseDown={preventFocusLoss} onClick={() => stepParagraph('before', -1)}>−</button>
                {SPACE_PT[paragraphMetrics.before ?? 'none']}
                <button type="button" aria-label="Increase space before" disabled={disabled || !hasParagraph} onMouseDown={preventFocusLoss} onClick={() => stepParagraph('before', 1)}>+</button>
              </span>
            </div>
            <div className="email-editor__kv">
              <span>After</span>
              <span className="email-editor__num">
                <button type="button" aria-label="Decrease space after" disabled={disabled || !hasParagraph} onMouseDown={preventFocusLoss} onClick={() => stepParagraph('after', -1)}>−</button>
                {SPACE_PT[paragraphMetrics.after ?? 'normal']}
                <button type="button" aria-label="Increase space after" disabled={disabled || !hasParagraph} onMouseDown={preventFocusLoss} onClick={() => stepParagraph('after', 1)}>+</button>
              </span>
            </div>
            <p className="email-pop__hint">
              {hasParagraph ? 'Applies to the selected paragraphs' : 'Click a paragraph in the letter.'}
            </p>
            <p className="email-pop__label">Whole email</p>
            <div className="email-editor__segments" role="radiogroup" aria-label="Email line spacing">
              {LINE_HEIGHTS.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={emailLine === choice}
                  className={emailLine === choice ? 'is-on' : undefined}
                  disabled={disabled}
                  onClick={() => applyEmailMetric('lineHeight', choice)}
                >
                  {lineHeightLabel(choice)}
                </button>
              ))}
            </div>
            <div className="email-editor__kv">
              <span>Before</span>
              <span className="email-editor__num">
                <button type="button" aria-label="Decrease email space before" disabled={disabled} onClick={() => stepEmail('before', -1)}>−</button>
                {SPACE_PT[emailMetrics.before ?? 'none']}
                <button type="button" aria-label="Increase email space before" disabled={disabled} onClick={() => stepEmail('before', 1)}>+</button>
              </span>
            </div>
            <div className="email-editor__kv">
              <span>After</span>
              <span className="email-editor__num">
                <button type="button" aria-label="Decrease email space after" disabled={disabled} onClick={() => stepEmail('after', -1)}>−</button>
                {SPACE_PT[emailMetrics.after ?? 'normal']}
                <button type="button" aria-label="Increase email space after" disabled={disabled} onClick={() => stepEmail('after', 1)}>+</button>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={paletteOpen ? 'email-page has-palette' : 'email-page'}
        ref={pageRef}
        onDragEnd={finishChipDrag}
      >
        {paletteOpen ? (
          <aside className="email-palette" aria-label="Merge fields">
            <p className="email-palette__title">
              Merge fields
              <small>drag into text</small>
            </p>
            {EMAIL_VARIABLES.map((variable) => (
              <div
                key={variable.id}
                className="email-palette__row"
                draggable={!disabled}
                onDragStart={(event) => onChipDragStart(event, variable.id)}
                onDragEnd={finishChipDrag}
              >
                <span className="email-palette__dots" aria-hidden="true">
                  <i /><i /><i /><i /><i /><i />
                </span>
                <button
                  type="button"
                  className="email-chip"
                  draggable={!disabled}
                  disabled={disabled}
                  onDragStart={(event) => onChipDragStart(event, variable.id)}
                  onDragEnd={finishChipDrag}
                  onClick={() => insertVariable(variable.id)}
                >
                  {variable.label}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="email-palette__hide"
              onClick={() => setPaletteOpen(false)}
            >
              Hide
            </button>
          </aside>
        ) : (
          <button type="button" className="email-palette__show" onClick={() => setPaletteOpen(true)}>
            Fields
          </button>
        )}
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
          onInput={() => {
            commitSheet()
            const sheet = sheetRef.current
            if (sheet) {
              decorateSheet(sheet)
            }
          }}
          onBlur={healSheet}
          onPointerDown={onSheetPointerDown}
          onDragOver={(event) => onChipOver(event, 'letter')}
          onDrop={(event) => onChipDrop(event, 'letter')}
        />
        {insertLine != null ? <div className="email-insline" style={{ top: insertLine }} /> : null}
        {caret?.host === 'letter' ? (
          <span
            className="email-dropcaret"
            style={{ left: caret.left, top: caret.top, height: caret.height }}
          />
        ) : null}
      </div>
    </div>
  )
}
