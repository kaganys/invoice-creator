import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Editor, Extensions } from '@tiptap/core'
import { Document } from '@tiptap/extension-document'
import { Link } from '@tiptap/extension-link'
import { Paragraph } from '@tiptap/extension-paragraph'
import { TextAlign } from '@tiptap/extension-text-align'
import { StarterKit } from '@tiptap/starter-kit'
import { DOMParser } from '@tiptap/pm/model'
import type { Node as ProseMirrorNode, ResolvedPos, Schema } from '@tiptap/pm/model'
import { NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Transaction } from '@tiptap/pm/state'
import {
  documentToEditorHtml,
  editorHtmlToDocument,
  emailInsertHtml,
  type EmailBrandAssets,
  type EmailInsertKind,
} from '../../invoice/emailDocument.ts'
import {
  EMPTY_METRICS,
  metricsActive,
  parseLineHeight,
  parseSpaceStep,
  spaceCss,
  type EmailSpacing,
  type LineHeightChoice,
  type ParagraphMetrics,
  type SpaceStep,
} from '../../invoice/emailSpacing.ts'
import { type EmailVariableId } from '../../invoice/emailTemplates.ts'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeField: {
      insertMergeField: (id: EmailVariableId) => ReturnType
    }
    emailLetter: {
      insertEmailPart: (kind: EmailInsertKind) => ReturnType
      setEmailSpacing: (spacing: EmailSpacing) => ReturnType
      setParagraphSpacing: (
        key: 'lineHeight' | 'spaceBefore' | 'spaceAfter',
        value: string | null,
      ) => ReturnType
    }
  }

  interface Storage {
    emailLetter: {
      brand: EmailBrandAssets
    }
  }
}

/**
 * TipTap schema for the invoice letter.
 * The saved document is still editorHtmlToDocument() of the editor HTML, so the
 * preview and the sent message stay on the existing renderer.
 */

const VARIABLE_LABEL: Record<EmailVariableId, string> = {
  invoice_number: 'Invoice number',
  customer_name: 'Customer name',
  business_name: 'Business name',
  amount: 'Amount due',
  due_date: 'Due date',
  zelle_email: 'Zelle email',
  payment_memo: 'Payment memo',
  payment_url: 'Payment link',
}

const BOUNDARY = new Set([
  'emailHeader',
  'emailAmount',
  'emailPayment',
  'emailButton',
  'emailLink',
  'emailAttachment',
  'emailFooter',
])

const SLOT = new Set(['amountLabel', 'amountValue', 'amountDue'])

function metricAttributes() {
  return {
    lineHeight: {
      default: null as LineHeightChoice | null,
      parseHTML: (element: HTMLElement) => parseLineHeight(element.getAttribute('data-line-height')),
      renderHTML: (attributes: { lineHeight?: LineHeightChoice | null }) =>
        attributes.lineHeight ? { 'data-line-height': attributes.lineHeight } : {},
    },
    spaceBefore: {
      default: null as SpaceStep | null,
      parseHTML: (element: HTMLElement) => parseSpaceStep(element.getAttribute('data-space-before')),
      renderHTML: (attributes: { spaceBefore?: SpaceStep | null }) =>
        attributes.spaceBefore ? { 'data-space-before': attributes.spaceBefore } : {},
    },
    spaceAfter: {
      default: null as SpaceStep | null,
      parseHTML: (element: HTMLElement) => parseSpaceStep(element.getAttribute('data-space-after')),
      renderHTML: (attributes: { spaceAfter?: SpaceStep | null }) =>
        attributes.spaceAfter ? { 'data-space-after': attributes.spaceAfter } : {},
    },
  }
}

function colorAttr(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : fallback
}

export const EmailParagraph = Paragraph.extend({
  // Highest block priority so Enter at the end of a paragraph creates
  // another paragraph. A lower priority makes the header the default
  // block, and the new line shows up as a second header.
  priority: 1000,
  parseHTML() {
    return [
      {
        tag: 'p',
        getAttrs: (element: HTMLElement) => {
          if (element.getAttribute('data-email-part') || element.getAttribute('data-email-slot')) {
            return false
          }
          return {}
        },
      },
    ]
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      ...metricAttributes(),
    }
  },
})

export const MergeField = Node.create({
  name: 'mergeField',
  priority: 200,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: 'customer_name',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-email-var'),
        renderHTML: (attributes: { id?: string }) => ({
          'data-email-var': attributes.id,
          contenteditable: 'false',
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-email-var]',
        getAttrs: (element: HTMLElement) => {
          const id = element.getAttribute('data-email-var') ?? ''
          if (!(id in VARIABLE_LABEL)) {
            return false
          }
          return { id }
        },
      },
    ]
  },

  renderHTML({ node }) {
    const id = String(node.attrs.id ?? '')
    const label = VARIABLE_LABEL[id as EmailVariableId] ?? id
    return [
      'span',
      { 'data-email-var': id, contenteditable: 'false' },
      label,
    ]
  },

  addCommands() {
    return {
      insertMergeField:
        (id: EmailVariableId) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { id } }),
    }
  },
})

function plainPart(name: string, part: string) {
  return Node.create({
    name,
    priority: 200,
    group: 'block',
    content: 'inline*',
    defining: true,
    isolating: true,
    marks: '',

    parseHTML() {
      return [{ tag: `p[data-email-part="${part}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return ['p', mergeAttributes(HTMLAttributes, { 'data-email-part': part }), 0]
    },
  })
}

export const EmailAttachment = plainPart('emailAttachment', 'attachment')
export const EmailFooter = plainPart('emailFooter', 'footer')

export const EmailHeader = Node.create({
  name: 'emailHeader',
  priority: 200,
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  marks: '',

  addAttributes() {
    return {
      background: {
        default: '#111111',
        parseHTML: (element: HTMLElement) => colorAttr(element.getAttribute('data-background'), '#111111'),
        renderHTML: (attributes: { background?: string }) => ({
          'data-background': attributes.background,
        }),
      },
      color: {
        default: '#f7f3ec',
        parseHTML: (element: HTMLElement) => colorAttr(element.getAttribute('data-color'), '#f7f3ec'),
        renderHTML: (attributes: { color?: string }) => ({
          'data-color': attributes.color,
        }),
      },
      showLogo: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          Boolean(element.querySelector('[data-email-slot="logo"]')) ||
          element.getAttribute('data-logo') === '1',
        renderHTML: (attributes: { showLogo?: boolean }) => ({
          'data-logo': attributes.showLogo ? '1' : '0',
        }),
      },
      showWordmark: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          Boolean(element.querySelector('[data-email-slot="wordmark"]')) ||
          element.getAttribute('data-wordmark') === '1',
        renderHTML: (attributes: { showWordmark?: boolean }) => ({
          'data-wordmark': attributes.showWordmark ? '1' : '0',
        }),
      },
      logoUrl: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.querySelector('[data-email-slot="logo"]')?.getAttribute('src') ?? '',
        renderHTML: () => ({}),
      },
      wordmarkUrl: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.querySelector('[data-email-slot="wordmark"]')?.getAttribute('src') ?? '',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-email-part="header"]',
        contentElement: (dom: HTMLElement) =>
          (dom.querySelector('[data-email-slot="name"]') as HTMLElement | null) ??
          dom.ownerDocument.createElement('span'),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const background = colorAttr(String(node.attrs.background ?? ''), '#111111')
    const color = colorAttr(String(node.attrs.color ?? ''), '#f7f3ec')
    const children: unknown[] = []
    if (node.attrs.showLogo) {
      const src = String(node.attrs.logoUrl ?? '')
      children.push([
        'img',
        {
          'data-email-slot': 'logo',
          class: src ? 'email-logo' : 'email-logo email-logo--slot',
          src,
          alt: '',
          width: '56',
          height: '56',
        },
      ])
    }
    if (node.attrs.showWordmark) {
      const src = String(node.attrs.wordmarkUrl ?? '')
      children.push([
        'img',
        {
          'data-email-slot': 'wordmark',
          class: src ? 'email-wordmark' : 'email-wordmark email-wordmark--slot',
          src,
          alt: '',
        },
      ])
    }
    children.push(['p', { 'data-email-slot': 'name' }, 0])
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-email-part': 'header',
        style: `background:${background};color:${color}`,
      }),
      ...children,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      const contentDOM = document.createElement('div')
      contentDOM.setAttribute('data-email-slot', 'name')
      dom.append(contentDOM)
      const paint = (current: ProseMirrorNode) => {
        const background = colorAttr(String(current.attrs.background ?? ''), '#111111')
        const color = colorAttr(String(current.attrs.color ?? ''), '#f7f3ec')
        dom.setAttribute('data-email-part', 'header')
        dom.setAttribute('data-background', background)
        dom.setAttribute('data-color', color)
        dom.setAttribute('data-logo', current.attrs.showLogo ? '1' : '0')
        dom.setAttribute('data-wordmark', current.attrs.showWordmark ? '1' : '0')
        dom.style.background = background
        dom.style.color = color
        for (const child of [...dom.children]) {
          if (child !== contentDOM) {
            child.remove()
          }
        }
        const images: HTMLImageElement[] = []
        if (current.attrs.showLogo) {
          const logo = document.createElement('img')
          const src = String(current.attrs.logoUrl ?? '')
          logo.setAttribute('data-email-slot', 'logo')
          logo.className = src ? 'email-logo' : 'email-logo email-logo--slot'
          logo.src = src
          logo.alt = ''
          logo.width = 56
          logo.height = 56
          images.push(logo)
        }
        if (current.attrs.showWordmark) {
          const wordmark = document.createElement('img')
          const src = String(current.attrs.wordmarkUrl ?? '')
          wordmark.setAttribute('data-email-slot', 'wordmark')
          wordmark.className = src ? 'email-wordmark' : 'email-wordmark email-wordmark--slot'
          wordmark.src = src
          wordmark.alt = ''
          images.push(wordmark)
        }
        for (const image of images) {
          dom.insertBefore(image, contentDOM)
        }
      }
      paint(node)
      return {
        dom,
        contentDOM,
        update(updated) {
          if (updated.type.name !== 'emailHeader') {
            return false
          }
          paint(updated)
          return true
        },
        ignoreMutation(mutation) {
          if (mutation.type === 'selection') {
            return false
          }
          return !contentDOM.contains(mutation.target)
        },
      }
    }
  },
})

const amountSlot = (name: string, slot: string) =>
  Node.create({
    name,
    priority: 200,
    content: 'inline*',
    marks: '',
    defining: true,

    parseHTML() {
      return [{ tag: `p[data-email-slot="${slot}"]` }]
    },

    renderHTML() {
      return ['p', { 'data-email-slot': slot }, 0]
    },
  })

export const AmountLabel = amountSlot('amountLabel', 'label')
export const AmountDue = amountSlot('amountDue', 'due')

export const AmountValue = Node.create({
  name: 'amountValue',
  priority: 200,
  atom: true,
  selectable: false,
  defining: true,

  addAttributes() {
    return {
      color: {
        default: '#1c1917',
        parseHTML: (element: HTMLElement) => {
          const style = element.getAttribute('style') ?? ''
          const match = /color:\s*(#[0-9a-fA-F]{3,6})/i.exec(style)
          return colorAttr(match?.[1], '#1c1917')
        },
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'p[data-email-slot="value"]' }]
  },

  renderHTML({ node }) {
    const color = colorAttr(String(node.attrs.color ?? ''), '#1c1917')
    return [
      'p',
      { 'data-email-slot': 'value', style: `color:${color}` },
      ['span', { 'data-email-var': 'amount', contenteditable: 'false' }, VARIABLE_LABEL.amount],
    ]
  },
})

export const EmailAmount = Node.create({
  name: 'emailAmount',
  priority: 200,
  group: 'block',
  content: 'amountLabel amountValue amountDue',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      background: {
        default: '#f7f3ec',
        parseHTML: (element: HTMLElement) => colorAttr(element.getAttribute('data-background'), '#f7f3ec'),
        renderHTML: (attributes: { background?: string }) => ({ 'data-background': attributes.background }),
      },
      border: {
        default: '#e4ddd2',
        parseHTML: (element: HTMLElement) => colorAttr(element.getAttribute('data-border'), '#e4ddd2'),
        renderHTML: (attributes: { border?: string }) => ({ 'data-border': attributes.border }),
      },
      labelColor: {
        default: '#5c564e',
        parseHTML: (element: HTMLElement) => colorAttr(element.getAttribute('data-label-color'), '#5c564e'),
        renderHTML: (attributes: { labelColor?: string }) => ({
          'data-label-color': attributes.labelColor,
        }),
      },
      amountColor: {
        default: '#1c1917',
        parseHTML: (element: HTMLElement) => colorAttr(element.getAttribute('data-amount-color'), '#1c1917'),
        renderHTML: (attributes: { amountColor?: string }) => ({
          'data-amount-color': attributes.amountColor,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-email-part="amount"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const background = colorAttr(String(node.attrs.background ?? ''), '#f7f3ec')
    const border = colorAttr(String(node.attrs.border ?? ''), '#e4ddd2')
    const labelColor = colorAttr(String(node.attrs.labelColor ?? ''), '#5c564e')
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-email-part': 'amount',
        style: `background:${background};border:1px solid ${border};color:${labelColor}`,
      }),
      0,
    ]
  },
})

export const EmailPayment = Node.create({
  name: 'emailPayment',
  priority: 200,
  group: 'block',
  content: '(paragraph | bulletList | orderedList)+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      zelleLabel: {
        default: 'Zelle',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-zelle-label') || 'Zelle',
        renderHTML: (attributes: { zelleLabel?: string }) => ({
          'data-zelle-label': attributes.zelleLabel || 'Zelle',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-email-part="payment"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-email-part': 'payment' }), 0]
  },
})

export const EmailButton = Node.create({
  name: 'emailButton',
  priority: 200,
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  marks: '',

  addAttributes() {
    return {
      background: {
        default: '#24352c',
        parseHTML: (element: HTMLElement) => colorAttr(element.getAttribute('data-background'), '#24352c'),
        renderHTML: (attributes: { background?: string }) => ({
          'data-background': attributes.background,
        }),
      },
      color: {
        default: '#f7f3ec',
        parseHTML: (element: HTMLElement) => colorAttr(element.getAttribute('data-color'), '#f7f3ec'),
        renderHTML: (attributes: { color?: string }) => ({ 'data-color': attributes.color }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'p[data-email-part="button"]',
        contentElement: (dom: HTMLElement) =>
          (dom.querySelector('a') as HTMLElement | null) ?? dom.ownerDocument.createElement('span'),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const background = colorAttr(String(node.attrs.background ?? ''), '#24352c')
    const color = colorAttr(String(node.attrs.color ?? ''), '#f7f3ec')
    return [
      'p',
      mergeAttributes(HTMLAttributes, { 'data-email-part': 'button' }),
      [
        'a',
        {
          href: '{{payment_url}}',
          style: `display:inline-block;background:${background};color:${color};padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;`,
        },
        0,
      ],
    ]
  },
})

export const EmailLink = Node.create({
  name: 'emailLink',
  priority: 200,
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  marks: '',

  parseHTML() {
    return [
      {
        tag: 'p[data-email-part="link"]',
        contentElement: (dom: HTMLElement) => {
          const slot = dom.querySelector('[data-email-slot="lead"]')
          if (slot instanceof HTMLElement) {
            return slot
          }
          const lead = dom.ownerDocument.createElement('span')
          lead.setAttribute('data-email-slot', 'lead')
          for (const child of [...dom.childNodes]) {
            if (child instanceof HTMLElement && (child.tagName === 'BR' || child.tagName === 'A')) {
              break
            }
            lead.appendChild(child.cloneNode(true))
          }
          return lead
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'p',
      mergeAttributes(HTMLAttributes, { 'data-email-part': 'link' }),
      ['span', { 'data-email-slot': 'lead' }, 0],
      ['br'],
      [
        'a',
        { href: '{{payment_url}}' },
        ['span', { 'data-email-var': 'payment_url', contenteditable: 'false' }, VARIABLE_LABEL.payment_url],
      ],
    ]
  },
})

export const EmailSpacingNode = Node.create({
  name: 'emailSpacing',
  priority: 200,
  group: 'block',
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      lineHeight: {
        default: null as LineHeightChoice | null,
        parseHTML: (element: HTMLElement) => parseLineHeight(element.getAttribute('data-line-height')),
        renderHTML: (attributes: { lineHeight?: LineHeightChoice | null }) =>
          attributes.lineHeight ? { 'data-line-height': attributes.lineHeight } : {},
      },
      spaceBefore: {
        default: null as SpaceStep | null,
        parseHTML: (element: HTMLElement) => parseSpaceStep(element.getAttribute('data-space-before')),
        renderHTML: (attributes: { spaceBefore?: SpaceStep | null }) =>
          attributes.spaceBefore ? { 'data-space-before': attributes.spaceBefore } : {},
      },
      spaceAfter: {
        default: null as SpaceStep | null,
        parseHTML: (element: HTMLElement) => parseSpaceStep(element.getAttribute('data-space-after')),
        renderHTML: (attributes: { spaceAfter?: SpaceStep | null }) =>
          attributes.spaceAfter ? { 'data-space-after': attributes.spaceAfter } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-email-part="spacing"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-email-part': 'spacing', contenteditable: 'false' })]
  },
})

function boundaryDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (BOUNDARY.has($pos.node(depth).type.name)) {
      return depth
    }
  }
  return null
}

function isAtStartOf($pos: ResolvedPos, depth: number): boolean {
  if ($pos.parentOffset !== 0) {
    return false
  }
  for (let level = $pos.depth; level > depth; level -= 1) {
    if ($pos.index(level - 1) !== 0) {
      return false
    }
  }
  return true
}

function isAtEndOf($pos: ResolvedPos, depth: number): boolean {
  if ($pos.parentOffset !== $pos.parent.content.size) {
    return false
  }
  for (let level = $pos.depth; level > depth; level -= 1) {
    const parent = $pos.node(level - 1)
    if ($pos.index(level - 1) !== parent.childCount - 1) {
      return false
    }
  }
  return true
}

function hasVisibleContent(node: ProseMirrorNode): boolean {
  let found = false
  node.descendants((child) => {
    if (found) {
      return false
    }
    if (child.type.name === 'mergeField' || (child.isText && Boolean(child.text?.trim()))) {
      found = true
      return false
    }
    return true
  })
  return found
}

function replaceWithParagraph(tr: Transaction, schema: Schema) {
  const paragraph = schema.nodes.paragraph
  if (!paragraph) {
    return tr
  }
  return tr.replaceWith(0, tr.doc.content.size, paragraph.create())
}

function removeNode(tr: Transaction, pos: number, schema: Schema) {
  const node = tr.doc.nodeAt(pos)
  if (!node) {
    return false
  }
  const end = pos + node.nodeSize
  if (end - pos >= tr.doc.content.size) {
    replaceWithParagraph(tr, schema)
  } else {
    tr.delete(pos, end)
  }
  const next = Math.min(pos + 1, tr.doc.content.size)
  const selection = TextSelection.near(tr.doc.resolve(Math.max(1, Math.min(next, tr.doc.content.size))))
  tr.setSelection(selection)
  return true
}

const EmailEditing = Extension.create({
  name: 'emailLetter',
  priority: 1000,

  addStorage() {
    return {
      brand: {} as EmailBrandAssets,
    }
  },

  addCommands() {
    return {
      insertEmailPart:
        (kind: EmailInsertKind) =>
        ({ editor, tr, dispatch }) => {
          const html = emailInsertHtml(kind, editor.storage.emailLetter.brand)
          const container = editor.view.dom.ownerDocument.createElement('div')
          container.innerHTML = html
          const slice = DOMParser.fromSchema(tr.doc.type.schema).parseSlice(container)
          const $from = tr.selection.$from
          const depth = boundaryDepth($from) ?? ($from.depth >= 1 ? 1 : null)
          const after = depth == null ? $from.pos : $from.after(depth)
          tr.insert(after, slice.content)
          const cursor = Math.min(after + 1, tr.doc.content.size)
          tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(1, cursor))))
          if (dispatch) {
            dispatch(tr.scrollIntoView())
          }
          return true
        },
      setEmailSpacing:
        (spacing: EmailSpacing) =>
        ({ state, dispatch }) => {
          let pos: number | null = null
          state.doc.descendants((node, position) => {
            if (node.type.name === 'emailSpacing') {
              pos = position
              return false
            }
            return true
          })
          const type = state.schema.nodes.emailSpacing
          if (!type) {
            return false
          }
          const tr = state.tr
          if (!metricsActive(spacing)) {
            if (pos == null) {
              return false
            }
            const node = state.doc.nodeAt(pos)
            if (!node) {
              return false
            }
            tr.delete(pos, pos + node.nodeSize)
          } else if (pos != null) {
            tr.setNodeMarkup(pos, undefined, {
              lineHeight: spacing.lineHeight,
              spaceBefore: spacing.before,
              spaceAfter: spacing.after,
            })
          } else {
            tr.insert(
              0,
              type.create({
                lineHeight: spacing.lineHeight,
                spaceBefore: spacing.before,
                spaceAfter: spacing.after,
              }),
            )
          }
          if (dispatch) {
            dispatch(tr)
          }
          return true
        },
      setParagraphSpacing:
        (key: 'lineHeight' | 'spaceBefore' | 'spaceAfter', value: string | null) =>
        ({ editor, commands }) => {
          const parsed =
            key === 'lineHeight' ? parseLineHeight(value) : parseSpaceStep(value)
          const attributes = { [key]: value ? parsed : null }
          if (editor.isActive('listItem')) {
            return commands.updateAttributes('listItem', attributes)
          }
          return commands.updateAttributes('paragraph', attributes)
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => exitPart(editor),
      Backspace: ({ editor }) => boundaryBackspace(editor),
      Delete: ({ editor }) => boundaryDelete(editor),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClickOn(view, _pos, node, nodePos, event) {
            if (!BOUNDARY.has(node.type.name) || node.type.name === 'emailAttachment' || node.type.name === 'emailFooter' || node.type.name === 'emailLink') {
              return false
            }
            const target = event.target
            if (!(target instanceof Element)) {
              return false
            }
            const dom = view.nodeDOM(nodePos)
            if (target !== dom) {
              return false
            }
            view.dispatch(
              view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)).scrollIntoView(),
            )
            return true
          },
        },
        appendTransaction(_transactions, _old, state) {
          const { selection } = state
          if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'emailSpacing') {
            return null
          }
          return state.tr.setSelection(TextSelection.near(state.doc.resolve(selection.to)))
        },
      }),
    ]
  },
})

function exitPart(editor: Editor): boolean {
  const { state } = editor
  if (!(state.selection instanceof TextSelection) || !state.selection.empty) {
    return false
  }
  const depth = boundaryDepth(state.selection.$from)
  if (depth == null) {
    return false
  }
  if (state.selection.$from.node(depth).type.name === 'emailPayment') {
    return false
  }
  return editor.commands.command(({ tr, dispatch }) => {
    const after = state.selection.$from.after(depth)
    const paragraph = state.schema.nodes.paragraph?.create()
    if (!paragraph) {
      return false
    }
    tr.insert(after, paragraph)
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size))))
    if (dispatch) {
      dispatch(tr.scrollIntoView())
    }
    return true
  })
}

function boundaryBackspace(editor: Editor): boolean {
  const { state } = editor
  if (!(state.selection instanceof TextSelection) || !state.selection.empty) {
    return false
  }
  const $from = state.selection.$from
  const depth = boundaryDepth($from)
  if ($from.parentOffset === 0 && SLOT.has($from.parent.type.name) && (depth == null || !isAtStartOf($from, depth))) {
    return true
  }
  if (depth != null && isAtStartOf($from, depth)) {
    const part = $from.node(depth)
    const partPos = $from.before(depth)
    const index = $from.index(depth - 1)
    if (!hasVisibleContent(part)) {
      return editor.commands.command(({ tr, dispatch }) => {
        if (!removeNode(tr, partPos, state.schema)) {
          return false
        }
        if (dispatch) {
          dispatch(tr.scrollIntoView())
        }
        return true
      })
    }
    if (index > 0) {
      const parent = $from.node(depth - 1)
      const prev = parent.child(index - 1)
      if (prev.type.name === 'emailSpacing') {
        return true
      }
      if (BOUNDARY.has(prev.type.name)) {
        const prevPos = partPos - prev.nodeSize
        return editor.commands.command(({ tr, dispatch }) => {
          tr.delete(prevPos, prevPos + prev.nodeSize)
          if (dispatch) {
            dispatch(tr.scrollIntoView())
          }
          return true
        })
      }
      return true
    }
    return true
  }
  if (depth == null && $from.depth >= 1 && isAtStartOf($from, 1)) {
    const index = $from.index(0)
    if (index === 0) {
      return false
    }
    const prev = $from.node(0).child(index - 1)
    if (prev.type.name === 'emailSpacing') {
      return true
    }
    if (!BOUNDARY.has(prev.type.name)) {
      return false
    }
    const prevPos = $from.before(1) - prev.nodeSize
    return editor.commands.command(({ tr, dispatch }) => {
      tr.delete(prevPos, prevPos + prev.nodeSize)
      if (dispatch) {
        dispatch(tr.scrollIntoView())
      }
      return true
    })
  }
  return false
}

function boundaryDelete(editor: Editor): boolean {
  const { state } = editor
  if (!(state.selection instanceof TextSelection) || !state.selection.empty) {
    return false
  }
  const $from = state.selection.$from
  const depth = boundaryDepth($from)
  if (
    $from.parentOffset === $from.parent.content.size &&
    SLOT.has($from.parent.type.name) &&
    (depth == null || !isAtEndOf($from, depth))
  ) {
    return true
  }
  if (depth != null && isAtEndOf($from, depth)) {
    const part = $from.node(depth)
    const parent = $from.node(depth - 1)
    const index = $from.index(depth - 1)
    if (!hasVisibleContent(part)) {
      const partPos = $from.before(depth)
      return editor.commands.command(({ tr, dispatch }) => {
        if (!removeNode(tr, partPos, state.schema)) {
          return false
        }
        if (dispatch) {
          dispatch(tr.scrollIntoView())
        }
        return true
      })
    }
    if (index < parent.childCount - 1) {
      const next = parent.child(index + 1)
      if (next.type.name === 'emailSpacing') {
        return true
      }
      if (BOUNDARY.has(next.type.name)) {
        const nextPos = $from.after(depth)
        return editor.commands.command(({ tr, dispatch }) => {
          tr.delete(nextPos, nextPos + next.nodeSize)
          if (dispatch) {
            dispatch(tr.scrollIntoView())
          }
          return true
        })
      }
    }
    return true
  }
  if (depth == null && $from.depth >= 1 && isAtEndOf($from, 1)) {
    const parent = $from.node(0)
    const index = $from.index(0)
    if (index >= parent.childCount - 1) {
      return false
    }
    const next = parent.child(index + 1)
    if (!BOUNDARY.has(next.type.name)) {
      return false
    }
    const nextPos = $from.after(1)
    return editor.commands.command(({ tr, dispatch }) => {
      tr.delete(nextPos, nextPos + next.nodeSize)
      if (dispatch) {
        dispatch(tr.scrollIntoView())
      }
      return true
    })
  }
  return false
}

export function syncDomSelection(view: EditorView) {
  if (view.composing || view.isDestroyed) {
    return
  }
  const domSelection = view.dom.ownerDocument.getSelection()
  const anchorNode = domSelection?.anchorNode
  const headNode = domSelection?.focusNode
  if (!domSelection || !anchorNode || !headNode || !view.dom.contains(anchorNode) || !view.dom.contains(headNode)) {
    return
  }
  let anchor: number
  let head: number
  try {
    anchor = view.posAtDOM(anchorNode, domSelection.anchorOffset)
    head = view.posAtDOM(headNode, domSelection.focusOffset)
  } catch {
    return
  }
  if (!Number.isInteger(anchor) || !Number.isInteger(head)) {
    return
  }
  const current = view.state.selection
  if (current instanceof NodeSelection && !domSelection.isCollapsed) {
    const from = current.from
    const to = current.to
    if (anchor >= from && anchor <= to && head >= from && head <= to) {
      return
    }
  }
  let next
  try {
    next = TextSelection.create(view.state.doc, anchor, head)
  } catch {
    try {
      next = TextSelection.near(view.state.doc.resolve(anchor))
    } catch {
      return
    }
  }
  if (next.eq(current)) {
    return
  }
  view.dispatch(view.state.tr.setSelection(next).setMeta('addToHistory', false))
}

const SelectionSync = Extension.create({
  name: 'selectionSync',
  priority: 2000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(editorView) {
          const doc = editorView.dom.ownerDocument
          let frame = 0
          const onSelection = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
              if (!editorView.isDestroyed) {
                syncDomSelection(editorView)
              }
            })
          }
          doc.addEventListener('selectionchange', onSelection)
          return {
            destroy() {
              cancelAnimationFrame(frame)
              doc.removeEventListener('selectionchange', onSelection)
            },
          }
        },
        props: {
          handleKeyDown(view, event) {
            if (
              (event.key === 'Backspace' || event.key === 'Delete') &&
              view.state.selection instanceof NodeSelection
            ) {
              return false
            }
            syncDomSelection(view)
            return false
          },
        },
      }),
    ]
  },
})

const kit = {
  heading: false,
  blockquote: false,
  code: false,
  codeBlock: false,
  horizontalRule: false,
  strike: false,
  underline: false,
  trailingNode: false,
  link: false,
  paragraph: false,
} as const

export function letterExtensions(): Extensions {
  return [
    SelectionSync,
    StarterKit.configure(kit),
    EmailParagraph,
    MergeField,
    EmailHeader,
    EmailAmount,
    AmountLabel,
    AmountValue,
    AmountDue,
    EmailPayment,
    EmailButton,
    EmailLink,
    EmailAttachment,
    EmailFooter,
    EmailSpacingNode,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: 'noreferrer noopener',
        target: '_blank',
      },
    }),
    TextAlign.configure({
      types: ['paragraph', 'bulletList', 'orderedList'],
      alignments: ['left', 'center', 'right'],
      defaultAlignment: null,
    }),
    Extension.create({
      name: 'emailListMetrics',
      addGlobalAttributes() {
        return [
          {
            types: ['bulletList', 'orderedList', 'listItem'],
            attributes: metricAttributes(),
          },
        ]
      },
    }),
    EmailEditing,
  ]
}

const SubjectEditing = Extension.create({
  name: 'subjectEditing',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () => true,
    }
  },
})

export function subjectExtensions(): Extensions {
  return [
    Document.extend({ content: 'paragraph' }),
    StarterKit.configure({
      ...kit,
      document: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      hardBreak: false,
    }),
    Paragraph,
    MergeField,
    Link.configure({
      openOnClick: false,
      autolink: false,
      HTMLAttributes: {
        rel: 'noreferrer noopener',
        target: '_blank',
      },
    }),
    SubjectEditing,
  ]
}

export function readEmailSpacing(editor: Editor): EmailSpacing {
  let spacing: EmailSpacing = { ...EMPTY_METRICS }
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'emailSpacing') {
      return true
    }
    spacing = {
      lineHeight: parseLineHeight(node.attrs.lineHeight as string | null),
      before: parseSpaceStep(node.attrs.spaceBefore as string | null),
      after: parseSpaceStep(node.attrs.spaceAfter as string | null),
    }
    return false
  })
  return spacing
}

export function readParagraphMetrics(editor: Editor): { active: boolean; metrics: ParagraphMetrics } {
  const { $from } = editor.state.selection
  let blocked = false
  let listItem: ProseMirrorNode | null = null
  let paragraph: ProseMirrorNode | null = null
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (BOUNDARY.has(node.type.name) && node.type.name !== 'emailPayment') {
      blocked = true
      break
    }
    if (SLOT.has(node.type.name)) {
      blocked = true
      break
    }
    if (node.type.name === 'listItem') {
      listItem = node
    }
    if (node.type.name === 'paragraph' && !paragraph) {
      paragraph = node
    }
  }
  const node = listItem ?? paragraph
  if (blocked || !node) {
    return { active: false, metrics: { ...EMPTY_METRICS } }
  }
  return {
    active: true,
    metrics: {
      lineHeight: parseLineHeight(node.attrs.lineHeight as string | null),
      before: parseSpaceStep(node.attrs.spaceBefore as string | null),
      after: parseSpaceStep(node.attrs.spaceAfter as string | null),
    },
  }
}

export function paintLetterSpacing(editor: Editor) {
  const spacing = readEmailSpacing(editor)
  const dom = editor.view.dom as HTMLElement
  dom.style.setProperty('--email-line', spacing.lineHeight ?? '1.55')
  dom.style.setProperty('--email-before', spacing.before ? spaceCss(spacing.before) : '0px')
  dom.style.setProperty('--email-after', spacing.after ? spaceCss(spacing.after) : '16px')
}

/** True when the editor should load incoming HTML instead of keeping the caret. */
export function shouldAdoptExternalLetter(editorHtml: string, incoming: string): boolean {
  const current = editorHtmlToDocument(editorHtml)
  const next = incoming.trim() ? editorHtmlToDocument(documentToEditorHtml(incoming)) : ''
  return current !== next
}

export function syncLetterBrand(editor: Editor, brand: EmailBrandAssets) {
  editor.storage.emailLetter.brand = brand
  const { state } = editor
  let tr = state.tr
  let changed = false
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'emailHeader') {
      return true
    }
    const logoUrl = brand.logoUrl ?? ''
    const wordmarkUrl = brand.wordmarkUrl ?? ''
    if (node.attrs.logoUrl === logoUrl && node.attrs.wordmarkUrl === wordmarkUrl) {
      return false
    }
    tr = tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      logoUrl,
      wordmarkUrl,
    })
    changed = true
    return false
  })
  if (!changed) {
    return
  }
  tr.setMeta('addToHistory', false)
  editor.view.dispatch(tr)
}

