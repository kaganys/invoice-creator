// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultGraphicalEmailBody } from '../../invoice/emailBlocks.ts'
import { defaultRichEmailBody } from '../../invoice/emailCompose.ts'
import {
  canonicalizeEmailBody,
  defaultEmailDocumentHtml,
  documentToEditorHtml,
  editorHtmlToDocument,
} from '../../invoice/emailDocument.ts'
import { prepareInvoiceEmail, SAMPLE_EMAIL_VARS } from '../../invoice/emailHtml.ts'
import { applyEmailTemplate, DEFAULT_EMAIL_SUBJECT } from '../../invoice/emailTemplates.ts'
import { letterExtensions, shouldAdoptExternalLetter } from './emailLetterSchema.ts'

const BRAND = {
  logoUrl: 'https://pay.example.com/branding/bitz-designs-icon.png',
  wordmarkUrl: 'https://pay.example.com/branding/bitz-designs-wordmark.png',
}

function mount(html = defaultEmailDocumentHtml()) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: letterExtensions(),
    content: documentToEditorHtml(html, BRAND),
    parseOptions: { preserveWhitespace: 'full' },
  })
  editor.storage.emailLetter.brand = BRAND
  return editor
}

function saved(editor: Editor) {
  return editorHtmlToDocument(editor.getHTML())
}

function findText(editor: Editor, text: string) {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1 || !node.isText || !node.text) {
      return
    }
    const index = node.text.indexOf(text)
    if (index !== -1) {
      found = pos + index
    }
  })
  if (found < 0) {
    throw new Error(`missing ${text} in ${editor.getText()}`)
  }
  return found
}

function findNode(editor: Editor, name: string) {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.type.name === name) {
      found = pos
      return false
    }
    return true
  })
  if (found < 0) {
    throw new Error(`missing node ${name}`)
  }
  return found
}

function findMerge(editor: Editor, id: string, parentName?: string) {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) {
      return false
    }
    if (parentName) {
      if (node.type.name !== parentName) {
        return true
      }
      node.descendants((child, childPos) => {
        if (found === -1 && child.type.name === 'mergeField' && child.attrs.id === id) {
          found = pos + 1 + childPos
        }
      })
      return false
    }
    if (node.type.name === 'mergeField' && node.attrs.id === id) {
      found = pos
      return false
    }
    return true
  })
  if (found < 0) {
    throw new Error(`missing merge ${id}`)
  }
  return found
}

function press(editor: Editor, at: number, key: string) {
  editor.commands.setTextSelection(at)
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event))
}

const editors: Editor[] = []

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy()
  }
  document.body.innerHTML = ''
})

function open(html?: string) {
  const editor = mount(html)
  editors.push(editor)
  return editor
}

describe('tiptap letter editor', () => {
  it('round-trips the default letter without changing the saved document', () => {
    const editor = open()
    expect(saved(editor)).toBe(defaultEmailDocumentHtml())
    expect(editor.getHTML()).toContain('Hello')
    expect(editor.getHTML()).toContain('Pay Online')
    expect(editor.getHTML()).toContain('Amount due')
  })

  it('keeps a legacy template on the same canonical document', () => {
    const legacy = defaultGraphicalEmailBody()
    const rich = defaultRichEmailBody()
    expect(saved(open(legacy))).toBe(canonicalizeEmailBody(legacy))
    expect(saved(open(rich))).toBe(canonicalizeEmailBody(rich))
  })

  it('types into a paragraph and does not reload an echoed save', () => {
    const editor = open()
    const at = findText(editor, 'Hello') + 'Hello'.length
    editor.chain().focus().setTextSelection(at).insertContent(' there').run()
    const caret = editor.state.selection.from
    const html = saved(editor)
    expect(html).toContain('Hello there')
    expect(shouldAdoptExternalLetter(editor.getHTML(), html)).toBe(false)
    expect(editor.state.selection.from).toBe(caret)
    editor.commands.setContent(documentToEditorHtml(html, BRAND), { emitUpdate: false })
    expect(saved(editor)).toBe(html)
  })

  it('splits at the end of a prose paragraph instead of cloning the header', () => {
    const editor = open()
    let end = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent.startsWith('Hello')) {
        end = pos + node.nodeSize - 1
        return false
      }
      return true
    })
    press(editor, end, 'Enter')
    editor.commands.insertContent('Second')
    const html = editor.getHTML()
    expect(html.match(/data-email-part="header"/g)).toHaveLength(1)
    expect(html).toContain('>Second<')
    expect(saved(editor)).toContain('Second')
    expect(shouldAdoptExternalLetter(html, saved(editor))).toBe(false)
    const next = findText(editor, 'Second')
    press(editor, next, 'Backspace')
    expect(saved(editor)).toContain('Hello')
    expect(saved(editor)).not.toContain('>Second<')
  })

  it('splits a prose paragraph on Enter and joins it again with Backspace', () => {
    const editor = open()
    const at = findText(editor, 'Hello') + 'Hello'.length
    press(editor, at, 'Enter')
    editor.commands.insertContent('Next')
    expect(saved(editor)).toContain('>Next {{customer_name}}')
    expect(saved(editor)).toContain('Hello')
    const next = findText(editor, 'Next')
    press(editor, next, 'Backspace')
    const joined = saved(editor)
    expect(joined).toContain('HelloNext')
    expect(joined).not.toContain('>Next<')
  })

  it('inserts a new line after the footer instead of splitting it', () => {
    const editor = open()
    const at = findText(editor, 'Sent by') + 4
    press(editor, at, 'Enter')
    editor.commands.insertContent('After')
    const html = editor.getHTML()
    expect(html).toContain('Sent by')
    expect(html.indexOf('data-email-part="footer"')).toBeLessThan(html.indexOf('After'))
    expect(saved(editor)).toContain('Sent by {{business_name}}')
    expect(saved(editor)).toContain('After')
  })

  it('deletes the amount box from the end of the paragraph above it', () => {
    const editor = open()
    const at = findText(editor, 'attached as a PDF.') + 'attached as a PDF.'.length
    press(editor, at, 'Delete')
    expect(saved(editor)).toContain('Please find')
    expect(saved(editor)).not.toContain('Amount due')
    expect(saved(editor)).toContain('Pay Online')
    editor.commands.undo()
    expect(saved(editor)).toContain('Amount due')
  })

  it('deletes the amount box from the following line and restores it with undo', () => {
    const editor = open()
    const at = findMerge(editor, 'payment_memo', 'emailPayment')
    press(editor, at, 'Backspace')
    expect(saved(editor)).not.toContain('Amount due')
    expect(saved(editor)).toContain('Hello')
    editor.commands.undo()
    expect(saved(editor)).toContain('Amount due')
    editor.commands.redo()
    expect(saved(editor)).not.toContain('Amount due')
  })

  it('deletes the pay button and the footer from the previous line', () => {
    const editor = open()
    const memo = findMerge(editor, 'payment_memo', 'emailPayment')
    const memoNode = editor.state.doc.nodeAt(memo)
    press(editor, memo + (memoNode?.nodeSize ?? 1), 'Delete')
    expect(saved(editor)).not.toContain('Pay Online')
    expect(saved(editor)).toContain('If the button does not work')

    const note = findText(editor, 'attached to this email.')
    press(editor, note + 'attached to this email.'.length, 'Delete')
    expect(saved(editor)).not.toContain('Sent by')
    expect(saved(editor)).toContain('attached to this email.')
  })

  it('deletes a selection that crosses the amount box', () => {
    const editor = open()
    const from = findText(editor, 'Please find')
    const to = findMerge(editor, 'payment_memo', 'emailPayment') + 1
    editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run()
    const html = saved(editor)
    expect(html).not.toContain('Amount due')
    expect(html).toContain('Hello')
  })

  it('removes an empty footer with Backspace', () => {
    const editor = open()
    const footer = findNode(editor, 'emailFooter')
    const footerNode = editor.state.doc.nodeAt(footer)
    editor.commands.setTextSelection({ from: footer + 1, to: footer + (footerNode?.nodeSize ?? 2) - 1 })
    editor.commands.deleteSelection()
    editor.commands.keyboardShortcut('Backspace')
    expect(saved(editor)).not.toContain('Sent by')
    expect(editor.getHTML()).not.toContain('data-email-part="footer"')
  })

  it('pastes formatted text and toggles bold, italic, and a link', () => {
    const editor = open()
    const at = findText(editor, 'Hello') + 'Hello'.length
    editor.commands.setTextSelection(at)
    editor.commands.insertContent(' <strong>bold</strong> <em>slant</em> linked')
    const from = findText(editor, 'linked')
    editor.chain().focus().setTextSelection({ from, to: from + 'linked'.length }).setLink({ href: 'https://example.com/pay' }).run()
    const html = saved(editor)
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>slant</em>')
    expect(html).toContain('https://example.com/pay')
  })

  it('inserts a merge field and a pay button at the cursor', () => {
    const editor = open()
    const at = findText(editor, 'Hello') + 'Hello'.length
    editor.commands.setTextSelection(at)
    editor.commands.insertMergeField('invoice_number')
    expect(saved(editor)).toContain('Hello{{invoice_number}}')
    editor.commands.insertEmailPart('button')
    const html = saved(editor)
    expect(html.split('Pay Online').length).toBeGreaterThan(2)
    const sent = prepareInvoiceEmail(html, SAMPLE_EMAIL_VARS, BRAND, {
      preheader: applyEmailTemplate(DEFAULT_EMAIL_SUBJECT, SAMPLE_EMAIL_VARS),
    }).html
    expect(sent.match(/Pay Online/g)?.length).toBeGreaterThan(1)
  })

  it('paints paragraph and email spacing the same in the preview and the sent html', () => {
    const editor = open()
    editor.chain().focus().setTextSelection(findText(editor, 'Hello')).run()
    editor.commands.setParagraphSpacing('lineHeight', '2')
    editor.commands.setParagraphSpacing('spaceAfter', 'none')
    editor.commands.setEmailSpacing({ lineHeight: '1.15', before: 'small', after: 'large' })
    const html = saved(editor)
    expect(html).toContain('data-line-height="2"')
    expect(html).toContain('data-space-after="none"')
    expect(html).toContain('data-line-height="1.15"')
    const roundTrip = editorHtmlToDocument(documentToEditorHtml(html))
    expect(roundTrip).toBe(html)
    const preview = prepareInvoiceEmail(html, SAMPLE_EMAIL_VARS, BRAND, {
      preheader: 'Preview',
    })
    const sent = prepareInvoiceEmail(roundTrip, SAMPLE_EMAIL_VARS, BRAND, {
      preheader: 'Preview',
    })
    expect(sent.html).toBe(preview.html)
    expect(sent.html).toContain('line-height:2')
    expect(sent.html).toContain('line-height:1.15')
  })

  it('selects the amount box and deletes it', () => {
    const editor = open()
    const pos = findNode(editor, 'emailAmount')
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
    editor.commands.deleteSelection()
    expect(saved(editor)).not.toContain('Amount due')
    expect(saved(editor)).toContain('Pay Online')
  })

  it('keeps a bulleted list through a save and reload', () => {
    const editor = open()
    editor.commands.setTextSelection(findText(editor, 'Hello'))
    editor.commands.toggleBulletList()
    const html = saved(editor)
    expect(html).toContain('<ul')
    expect(html).toContain('Hello')
    expect(editorHtmlToDocument(documentToEditorHtml(html))).toBe(html)
  })

  it('undoes typed text without dropping the rest of the letter', () => {
    const editor = open()
    const at = findText(editor, 'Hello') + 'Hello'.length
    editor.chain().focus().setTextSelection(at).insertContent('XYZ').run()
    expect(saved(editor)).toContain('HelloXYZ')
    editor.commands.undo()
    const html = saved(editor)
    expect(html).not.toContain('XYZ')
    expect(html).toContain('Pay Online')
    expect(html).toContain('Sent by')
    editor.commands.redo()
    expect(saved(editor)).toContain('HelloXYZ')
  })
})
