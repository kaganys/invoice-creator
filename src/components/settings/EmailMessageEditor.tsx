import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { editorHtmlToSubject, subjectToEditorHtml } from '../../invoice/emailCompose.ts'
import { documentToEditorHtml, editorHtmlToDocument } from '../../invoice/emailDocument.ts'
import type { EmailInsertKind } from '../../invoice/emailDocument.ts'
import {
  EMPTY_METRICS,
  LINE_HEIGHTS,
  SPACE_STEPS,
  type EmailSpacing,
  type LineHeightChoice,
  type ParagraphMetrics,
  type SpaceStep,
} from '../../invoice/emailSpacing.ts'
import {
  EMAIL_VARIABLES,
  defaultEmailTemplates,
  type EmailVariableId,
} from '../../invoice/emailTemplates.ts'
import {
  letterExtensions,
  paintLetterSpacing,
  syncDomSelection,
  readEmailSpacing,
  readParagraphMetrics,
  shouldAdoptExternalLetter,
  subjectExtensions,
  syncLetterBrand,
} from './emailLetterSchema.ts'

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

function spaceLabel(choice: SpaceStep): string {
  return choice[0].toUpperCase() + choice.slice(1)
}

function sameMetrics(left: ParagraphMetrics, right: ParagraphMetrics): boolean {
  return left.lineHeight === right.lineHeight && left.before === right.before && left.after === right.after
}

function SpacingSelect({
  name,
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  name: string
  label: string
  value: string
  disabled?: boolean
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="email-editor__metric">
      <span>{label}</span>
      <select
        aria-label={`${name} ${label.toLowerCase()}`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Default</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
  const brandAssets = useMemo(
    () => ({
      logoUrl: brand?.logoUrl,
      wordmarkUrl: brand?.wordmarkUrl,
    }),
    [brand?.logoUrl, brand?.wordmarkUrl],
  )
  const extensions = useMemo(() => letterExtensions(), [])
  const subjectSchema = useMemo(() => subjectExtensions(), [])
  const letterProps = useMemo(
    () => ({
      attributes: {
        class: 'email-sheet',
        'aria-label': 'Email',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    }),
    [],
  )
  const subjectProps = useMemo(
    () => ({
      attributes: {
        id: 'email-subject',
        class: 'email-rich email-rich--paper email-rich--line',
        'aria-label': 'Subject',
        'aria-multiline': 'false',
        spellcheck: 'true',
      },
    }),
    [],
  )
  const initialLetter = useRef(documentToEditorHtml(html, brandAssets))
  const initialSubject = useRef(subjectToEditorHtml(subject))
  const htmlProp = useRef(html)
  const subjectProp = useRef(subject)
  const onChangeRef = useRef(onChange)
  const brandRef = useRef(brandAssets)
  const active = useRef<'subject' | 'letter'>('letter')
  const applying = useRef(false)
  const letterRef = useRef<Editor | null>(null)
  const subjectRef = useRef<Editor | null>(null)
  htmlProp.current = html
  subjectProp.current = subject
  onChangeRef.current = onChange
  brandRef.current = brandAssets

  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [spacingOpen, setSpacingOpen] = useState(false)
  const [paragraphMetrics, setParagraphMetrics] = useState<ParagraphMetrics>(EMPTY_METRICS)
  const [emailMetrics, setEmailMetrics] = useState<EmailSpacing>(EMPTY_METRICS)
  const [hasParagraph, setHasParagraph] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [linkError, setLinkError] = useState<string | null>(null)
  const fieldsRef = useRef<HTMLDivElement>(null)
  const insertRef = useRef<HTMLDivElement>(null)

  function publish(nextSubject: string, nextHtml: string) {
    if (nextSubject === subjectProp.current && nextHtml === htmlProp.current) {
      return
    }
    onChangeRef.current({ subject: nextSubject, html: nextHtml })
  }

  function refreshChrome(editor: Editor) {
    paintLetterSpacing(editor)
    const paragraph = readParagraphMetrics(editor)
    setHasParagraph((current) => (current === paragraph.active ? current : paragraph.active))
    setParagraphMetrics((current) => (sameMetrics(current, paragraph.metrics) ? current : paragraph.metrics))
    const email = readEmailSpacing(editor)
    setEmailMetrics((current) => (sameMetrics(current, email) ? current : email))
    const historyEditor = active.current === 'subject' ? subjectRef.current ?? editor : editor
    setCanUndo(historyEditor.can().undo())
    setCanRedo(historyEditor.can().redo())
  }

  const letter = useEditor(
    {
      extensions,
      editorProps: letterProps,
      content: initialLetter.current,
      parseOptions: { preserveWhitespace: 'full' },
      immediatelyRender: true,
      onFocus: () => {
        active.current = 'letter'
      },
      onCreate: ({ editor }) => {
        editor.storage.emailLetter.brand = brandRef.current
        paintLetterSpacing(editor)
        const next = editorHtmlToDocument(editor.getHTML())
        if (!applying.current && next !== htmlProp.current) {
          publish(subjectProp.current, next)
        }
      },
      onUpdate: ({ editor }) => {
        refreshChrome(editor)
        if (applying.current) {
          return
        }
        publish(
          editorHtmlToSubject(subjectRef.current?.getHTML() ?? subjectToEditorHtml(subjectProp.current)),
          editorHtmlToDocument(editor.getHTML()),
        )
      },
      onSelectionUpdate: ({ editor }) => {
        refreshChrome(editor)
      },
    },
    [],
  )

  letterRef.current = letter

  const subjectEditor = useEditor(
    {
      extensions: subjectSchema,
      editorProps: subjectProps,
      content: initialSubject.current,
      immediatelyRender: true,
      onFocus: () => {
        active.current = 'subject'
      },
      onUpdate: ({ editor }) => {
        if (applying.current) {
          return
        }
        const nextSubject = editorHtmlToSubject(editor.getHTML())
        publish(nextSubject, letterRef.current ? editorHtmlToDocument(letterRef.current.getHTML()) : htmlProp.current)
        setCanUndo(editor.can().undo())
        setCanRedo(editor.can().redo())
      },
    },
    [],
  )

  useEffect(() => {
    if (!letter) {
      return
    }
    letter.setEditable(!disabled, false)
    subjectEditor?.setEditable(!disabled, false)
  }, [disabled, letter, subjectEditor])

  useEffect(() => {
    subjectRef.current = subjectEditor
  }, [subjectEditor])

  useEffect(() => {
    if (!letter || shouldAdoptExternalLetter(letter.getHTML(), html)) {
      if (!letter) {
        return
      }
      applying.current = true
      letter.commands.setContent(documentToEditorHtml(html, brandRef.current), {
        emitUpdate: false,
        parseOptions: { preserveWhitespace: 'full' },
      })
      syncLetterBrand(letter, brandRef.current)
      paintLetterSpacing(letter)
      applying.current = false
      return
    }
  }, [html, letter])

  useEffect(() => {
    if (!subjectEditor) {
      return
    }
    const current = editorHtmlToSubject(subjectEditor.getHTML())
    if (current === subject) {
      return
    }
    applying.current = true
    subjectEditor.commands.setContent(subjectToEditorHtml(subject), { emitUpdate: false })
    applying.current = false
  }, [subject, subjectEditor])

  useEffect(() => {
    if (!letter) {
      return
    }
    syncLetterBrand(letter, brandAssets)
  }, [letter, brandAssets])

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

  function focusedEditor(): Editor | null {
    return active.current === 'subject' ? subjectEditor : letter
  }

  function undo() {
    focusedEditor()?.chain().focus().undo().run()
  }

  function redo() {
    focusedEditor()?.chain().focus().redo().run()
  }

  function insertVariable(id: EmailVariableId) {
    const editor = focusedEditor()
    if (!editor) {
      return
    }
    syncDomSelection(editor.view)
    editor.chain().focus().insertMergeField(id).run()
    setFieldsOpen(false)
  }

  function insertPart(kind: EmailInsertKind) {
    if (!letter) {
      return
    }
    syncDomSelection(letter.view)
    letter.chain().focus().insertEmailPart(kind).run()
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
    focusedEditor()?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function resetTemplate() {
    if (!letter || !subjectEditor) {
      return
    }
    const defaults = defaultEmailTemplates()
    const nextHtml = editorHtmlToDocument(documentToEditorHtml(defaults.body, brandRef.current))
    applying.current = true
    subjectEditor.commands.setContent(subjectToEditorHtml(defaults.subject), { emitUpdate: false })
    letter.commands.setContent(documentToEditorHtml(nextHtml, brandRef.current), {
      emitUpdate: false,
      parseOptions: { preserveWhitespace: 'full' },
    })
    syncLetterBrand(letter, brandRef.current)
    paintLetterSpacing(letter)
    applying.current = false
    publish(defaults.subject, nextHtml)
  }

  function applyParagraphMetric(key: 'lineHeight' | 'spaceBefore' | 'spaceAfter', value: string) {
    letter?.chain().focus().setParagraphSpacing(key, value || null).run()
  }

  function applyEmailMetric(key: 'lineHeight' | 'before' | 'after', value: string) {
    if (!letter) {
      return
    }
    const next: EmailSpacing = {
      ...readEmailSpacing(letter),
      [key]: key === 'lineHeight' ? value || null : value || null,
    }
    if (key === 'lineHeight') {
      next.lineHeight = value ? (value as EmailSpacing['lineHeight']) : null
    } else if (key === 'before') {
      next.before = value ? (value as EmailSpacing['before']) : null
    } else {
      next.after = value ? (value as EmailSpacing['after']) : null
    }
    letter.chain().focus().setEmailSpacing(next).run()
  }

  return (
    <div className="email-editor">
      <div className="email-editor__subject">
        <label className="field__label" htmlFor="email-subject">
          Subject
        </label>
        <EditorContent editor={subjectEditor} />
        <p className="settings-help">Reads as: {subjectPreview}</p>
      </div>

      <div className="email-editor__bar">
        <div className="email-editor__toolbar" role="toolbar" aria-label="Formatting">
          <div className="email-editor__group">
            <ToolButton label="Bold" disabled={disabled} onClick={() => focusedEditor()?.chain().focus().toggleBold().run()}>
              <ToolIcon>
                <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
                <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
              </ToolIcon>
            </ToolButton>
            <ToolButton label="Italic" disabled={disabled} onClick={() => focusedEditor()?.chain().focus().toggleItalic().run()}>
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
            <ToolButton label="Bulleted list" disabled={disabled} onClick={() => letter?.chain().focus().toggleBulletList().run()}>
              <ToolIcon>
                <path d="M9 6h12" />
                <path d="M9 12h12" />
                <path d="M9 18h12" />
                <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
                <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
                <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
              </ToolIcon>
            </ToolButton>
            <ToolButton label="Numbered list" disabled={disabled} onClick={() => letter?.chain().focus().toggleOrderedList().run()}>
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
            <ToolButton label="Align left" disabled={disabled} onClick={() => letter?.chain().focus().setTextAlign('left').run()}>
              <ToolIcon>
                <path d="M4 6h16" />
                <path d="M4 12h10" />
                <path d="M4 18h14" />
              </ToolIcon>
            </ToolButton>
            <ToolButton label="Align center" disabled={disabled} onClick={() => letter?.chain().focus().setTextAlign('center').run()}>
              <ToolIcon>
                <path d="M4 6h16" />
                <path d="M7 12h10" />
                <path d="M5 18h14" />
              </ToolIcon>
            </ToolButton>
            <ToolButton label="Align right" disabled={disabled} onClick={() => letter?.chain().focus().setTextAlign('right').run()}>
              <ToolIcon>
                <path d="M4 6h16" />
                <path d="M10 12h10" />
                <path d="M6 18h14" />
              </ToolIcon>
            </ToolButton>
          </div>
          <span className="email-editor__divider" aria-hidden="true" />
          <div className="email-editor__group">
            <ToolButton
              label="Line and paragraph spacing"
              disabled={disabled}
              onClick={() => {
                setSpacingOpen((open) => !open)
                setFieldsOpen(false)
                setInsertOpen(false)
                if (letter) {
                  refreshChrome(letter)
                }
              }}
            >
              <ToolIcon>
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h10" />
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
      {spacingOpen ? (
        <div className="email-editor__spacing" role="group" aria-label="Line and paragraph spacing">
          <div className="email-editor__spacing-set">
            <p className="email-editor__spacing-title">This paragraph</p>
            <SpacingSelect
              name="This paragraph"
              label="Line"
              value={paragraphMetrics.lineHeight ?? ''}
              disabled={disabled || !hasParagraph}
              options={LINE_HEIGHTS.map((choice) => ({
                value: choice,
                label: lineHeightLabel(choice),
              }))}
              onChange={(value) => applyParagraphMetric('lineHeight', value)}
            />
            <SpacingSelect
              name="This paragraph"
              label="Before"
              value={paragraphMetrics.before ?? ''}
              disabled={disabled || !hasParagraph}
              options={SPACE_STEPS.map((choice) => ({
                value: choice,
                label: spaceLabel(choice),
              }))}
              onChange={(value) => applyParagraphMetric('spaceBefore', value)}
            />
            <SpacingSelect
              name="This paragraph"
              label="After"
              value={paragraphMetrics.after ?? ''}
              disabled={disabled || !hasParagraph}
              options={SPACE_STEPS.map((choice) => ({
                value: choice,
                label: spaceLabel(choice),
              }))}
              onChange={(value) => applyParagraphMetric('spaceAfter', value)}
            />
            {hasParagraph ? null : (
              <p className="email-editor__spacing-note">Click a paragraph in the letter.</p>
            )}
          </div>
          <div className="email-editor__spacing-set">
            <p className="email-editor__spacing-title">Whole email</p>
            <SpacingSelect
              name="Whole email"
              label="Line"
              value={emailMetrics.lineHeight ?? ''}
              disabled={disabled}
              options={LINE_HEIGHTS.map((choice) => ({
                value: choice,
                label: lineHeightLabel(choice),
              }))}
              onChange={(value) => applyEmailMetric('lineHeight', value)}
            />
            <SpacingSelect
              name="Whole email"
              label="Before"
              value={emailMetrics.before ?? ''}
              disabled={disabled}
              options={SPACE_STEPS.map((choice) => ({
                value: choice,
                label: spaceLabel(choice),
              }))}
              onChange={(value) => applyEmailMetric('before', value)}
            />
            <SpacingSelect
              name="Whole email"
              label="After"
              value={emailMetrics.after ?? ''}
              disabled={disabled}
              options={SPACE_STEPS.map((choice) => ({
                value: choice,
                label: spaceLabel(choice),
              }))}
              onChange={(value) => applyEmailMetric('after', value)}
            />
          </div>
        </div>
      ) : null}

      <div className="email-page">
        <EditorContent editor={letter} />
      </div>
    </div>
  )
}
