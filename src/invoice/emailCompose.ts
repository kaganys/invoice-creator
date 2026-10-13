import type { EmailVariableId } from './emailTemplates.ts'

export const EMAIL_SECTION_IDS = [
  'amount',
  'payment-memo',
  'zelle',
  'pay-button',
] as const

export type EmailSectionId = (typeof EMAIL_SECTION_IDS)[number]

export type EmailDocument = {
  proseHtml: string
  sections: Record<EmailSectionId, boolean>
}

const PARAGRAPH =
  'margin:0 0 16px;font-size:16px;line-height:1.55;color:#111111;'

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

const SECTION_LABEL: Record<EmailSectionId, string> = {
  amount: 'Amount due',
  'payment-memo': 'Payment memo',
  zelle: 'Zelle address',
  'pay-button': 'Pay online button',
}

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g

function paragraph(inner: string): string {
  return `<p style="${PARAGRAPH}">${inner}</p>`
}

function sectionWrap(id: EmailSectionId, inner: string): string {
  return `<!--email-section:${id}-->${inner}<!--/email-section-->`
}

const SECTION_HTML: Record<EmailSectionId, string> = {
  amount: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:#f7f3ec;border:1px solid #e4ddd2;padding:18px 20px;">
<p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#5c564e;font-weight:700;">Amount due</p>
<p style="margin:6px 0 0;font-size:28px;line-height:1.2;font-weight:700;color:#1c1917;">{{amount}}</p>
<p style="margin:6px 0 0;font-size:14px;color:#5c564e;">Due {{due_date}}</p>
</td></tr></table>`,
  'payment-memo': paragraph('{{payment_memo}}'),
  zelle: paragraph('Zelle: <strong style="color:#111111;">{{zelle_email}}</strong>'),
  'pay-button': `<!--payment-url:start--><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td align="center" style="padding:4px 0 8px;">
<a href="{{payment_url}}" target="_blank" rel="noreferrer noopener" style="display:inline-block;background:#24352c;color:#f7f3ec;padding:12px 22px;font-size:14px;font-weight:700;text-decoration:none;">Pay Online</a>
</td></tr></table>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#5c564e;text-align:center;">If the button does not work, open this secure link:<br><a href="{{payment_url}}" target="_blank" rel="noreferrer noopener" style="color:#24352c;word-break:break-all;">{{payment_url}}</a></p><!--payment-url:end-->`,
}

export function emailSectionLabel(id: EmailSectionId): string {
  return SECTION_LABEL[id]
}

export function defaultRichEmailBody(): string {
  return [
    paragraph('Hello {{customer_name}},'),
    paragraph('Please find invoice {{invoice_number}} attached as a PDF.'),
    sectionWrap('amount', SECTION_HTML.amount),
    sectionWrap('payment-memo', SECTION_HTML['payment-memo']),
    sectionWrap('pay-button', SECTION_HTML['pay-button']),
    paragraph('Thank you,<br>{{business_name}}'),
  ].join('\n')
}

export function emptyEmailSections(): Record<EmailSectionId, boolean> {
  return {
    amount: false,
    'payment-memo': false,
    zelle: false,
    'pay-button': false,
  }
}

type ElementNode = {
  tag: string
  attrs: Record<string, string>
  children: AnyNode[]
}

type TextNode = { text: string }

type AnyNode = ElementNode | TextNode

function isElement(node: AnyNode): node is ElementNode {
  return 'tag' in node
}

const VOID_TAGS = new Set(['br', 'img', 'hr', 'wbr'])

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  for (const match of raw.matchAll(pattern)) {
    const key = match[1].toLowerCase()
    if (key.startsWith('/') || key === '') {
      continue
    }
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

function parseNodes(html: string): AnyNode[] {
  return parseUntil(html, 0, null).nodes
}

function parseUntil(
  html: string,
  start: number,
  stopTag: string | null,
): { nodes: AnyNode[]; index: number } {
  const nodes: AnyNode[] = []
  let index = start
  let textStart = start
  while (index < html.length) {
    const lt = html.indexOf('<', index)
    if (lt === -1) {
      pushText(nodes, html.slice(textStart))
      return { nodes, index: html.length }
    }
    if (html.startsWith('<!--', lt)) {
      pushText(nodes, html.slice(textStart, lt))
      const end = html.indexOf('-->', lt + 4)
      index = end === -1 ? html.length : end + 3
      textStart = index
      continue
    }
    const gt = html.indexOf('>', lt + 1)
    if (gt === -1) {
      pushText(nodes, html.slice(textStart))
      return { nodes, index: html.length }
    }
    const inner = html.slice(lt + 1, gt).trim()
    if (inner.startsWith('/')) {
      const closing = inner.slice(1).trim().split(/\s+/)[0]?.toLowerCase() ?? ''
      if (stopTag && closing === stopTag) {
        pushText(nodes, html.slice(textStart, lt))
        return { nodes, index: gt + 1 }
      }
      pushText(nodes, html.slice(textStart, lt))
      index = gt + 1
      textStart = index
      continue
    }
    pushText(nodes, html.slice(textStart, lt))
    const name = inner.split(/\s+/)[0]?.replace(/\/$/, '').toLowerCase() ?? ''
    const attrSource = inner.slice(name.length).replace(/\/$/, '')
    const attrs = parseAttrs(attrSource)
    index = gt + 1
    if (VOID_TAGS.has(name) || inner.endsWith('/')) {
      nodes.push({ tag: name, attrs, children: [] })
      textStart = index
      continue
    }
    const nested = parseUntil(html, index, name)
    nodes.push({ tag: name, attrs, children: nested.nodes })
    index = nested.index
    textStart = index
  }
  pushText(nodes, html.slice(textStart))
  return { nodes, index }
}

function pushText(nodes: AnyNode[], value: string) {
  const text = decodeEntities(value)
  if (text.length === 0) {
    return
  }
  nodes.push({ text })
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

function textAlign(attrs: Record<string, string>): string | null {
  const style = attrs.style ?? ''
  const fromStyle = /text-align\s*:\s*(left|center|right)/i.exec(style)
  if (fromStyle) {
    return fromStyle[1].toLowerCase()
  }
  const align = (attrs.align ?? '').toLowerCase()
  if (align === 'left' || align === 'center' || align === 'right') {
    return align
  }
  return null
}

function safeHref(value: string | undefined): string | null {
  const href = (value ?? '').trim()
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href) || href === '{{payment_url}}') {
    return href
  }
  return null
}

function variableId(value: string | undefined): EmailVariableId | null {
  const id = (value ?? '').trim()
  if (id in VARIABLE_LABEL) {
    return id as EmailVariableId
  }
  return null
}

function sectionId(value: string | undefined): EmailSectionId | null {
  if (EMAIL_SECTION_IDS.includes(value as EmailSectionId)) {
    return value as EmailSectionId
  }
  return null
}

function appendInline(html: string, piece: string): string {
  if (!piece) {
    return html
  }
  if (html && /[A-Za-z0-9}]$/.test(html) && /^[A-Za-z0-9]/.test(piece)) {
    return `${html} ${piece}`
  }
  return html + piece
}

function renderInline(nodes: AnyNode[]): string {
  let html = ''
  for (const node of nodes) {
    if (!isElement(node)) {
      html = appendInline(html, escapeText(node.text))
      continue
    }
    const variable = node.tag === 'span' ? variableId(node.attrs['data-email-var']) : null
    if (variable) {
      html = appendInline(html, `{{${variable}}}`)
      continue
    }
    if (node.tag === 'br') {
      html += '<br>'
      continue
    }
    if (node.tag === 'strong' || node.tag === 'b') {
      const inner = renderInline(node.children)
      if (inner.trim()) {
        html = appendInline(html, `<strong>${inner}</strong>`)
      }
      continue
    }
    if (node.tag === 'em' || node.tag === 'i') {
      const inner = renderInline(node.children)
      if (inner.trim()) {
        html = appendInline(html, `<em>${inner}</em>`)
      }
      continue
    }
    if (node.tag === 'a') {
      const href = safeHref(node.attrs.href)
      const inner = renderInline(node.children)
      if (href && inner.trim()) {
        html = appendInline(
          html,
          `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer noopener">${inner}</a>`,
        )
      } else {
        html = appendInline(html, inner)
      }
      continue
    }
    html = appendInline(html, renderInline(node.children))
  }
  return html
}

function paragraphStyle(align: string | null): string {
  if (!align || align === 'left') {
    return PARAGRAPH
  }
  return `${PARAGRAPH}text-align:${align};`
}

type Rendered = {
  prose: string[]
  sections: EmailSectionId[]
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'blockquote',
  'x-section',
  'section',
  'article',
])

function containsBlock(nodes: AnyNode[]): boolean {
  return nodes.some(
    (node) => isElement(node) && (BLOCK_TAGS.has(node.tag) || containsBlock(node.children)),
  )
}

function renderMixed(node: ElementNode, into: Rendered, align: string | null) {
  let inline: AnyNode[] = []
  const pieces: Array<{ type: 'text'; value: string } | { type: 'html'; value: string }> = []
  const flush = () => {
    const inner = renderInline(inline).replace(/[ \t]+/g, ' ').trim()
    inline = []
    if (inner) {
      pieces.push({ type: 'text', value: inner })
    }
  }
  for (const child of node.children) {
    if (!isElement(child) || child.tag === 'br' || !BLOCK_TAGS.has(child.tag)) {
      if (!isElement(child) && !child.text.trim() && inline.length === 0) {
        continue
      }
      inline.push(child)
      continue
    }
    flush()
    const nested: Rendered = { prose: [], sections: [] }
    renderBlocks([child], nested, textAlign(child.attrs) ?? align)
    for (const block of nested.prose) {
      pieces.push({ type: 'html', value: block })
    }
    into.sections.push(...nested.sections)
  }
  flush()
  for (const piece of pieces) {
    if (piece.type === 'html') {
      into.prose.push(piece.value)
      continue
    }
    into.prose.push(`<p style="${paragraphStyle(align)}">${piece.value}</p>`)
  }
}

function renderBlocks(nodes: AnyNode[], into: Rendered, inheritedAlign: string | null) {
  let inline: AnyNode[] = []
  const flush = () => {
    const inner = renderInline(inline).replace(/\s+/g, ' ').trim()
    inline = []
    if (inner) {
      into.prose.push(`<p style="${paragraphStyle(inheritedAlign)}">${inner}</p>`)
    }
  }

  for (const node of nodes) {
    if (!isElement(node)) {
      if (node.text.trim()) {
        inline.push(node)
      }
      continue
    }
    if (node.tag === 'br') {
      inline.push(node)
      continue
    }
    if (!BLOCK_TAGS.has(node.tag)) {
      inline.push(node)
      continue
    }
    flush()
    const marker = node.tag === 'x-section' ? sectionId(node.attrs['data-id']) : null
    const fromDiv =
      node.tag === 'div' ? sectionId(node.attrs['data-email-section']) : null
    const id = marker ?? fromDiv
    if (id) {
      into.sections.push(id)
      continue
    }
    const align = textAlign(node.attrs) ?? inheritedAlign
    if (node.tag === 'ul' || node.tag === 'ol') {
      const items = node.children
        .filter(isElement)
        .filter((child) => child.tag === 'li')
        .map((child) => renderInline(child.children).trim())
        .filter(Boolean)
        .map((inner) => `<li>${inner}</li>`)
      if (items.length > 0) {
        const style =
          align && align !== 'left'
            ? ` style="margin:0 0 16px;padding-left:22px;text-align:${align};"`
            : ' style="margin:0 0 16px;padding-left:22px;"'
        into.prose.push(`<${node.tag}${style}>${items.join('')}</${node.tag}>`)
      }
      continue
    }
    if (node.tag === 'p' || node.tag === 'div' || node.tag === 'h1' || node.tag === 'h2' || node.tag === 'h3' || node.tag === 'li') {
      if ((node.tag === 'p' || node.tag === 'div') && containsBlock(node.children)) {
        renderMixed(node, into, align)
        continue
      }
      const inner = renderInline(node.children).trim()
      if (!inner) {
        continue
      }
      if (node.tag === 'li') {
        into.prose.push(`<p style="${paragraphStyle(align)}">${inner}</p>`)
        continue
      }
      const tag = node.tag === 'h1' || node.tag === 'h2' || node.tag === 'h3' ? 'h2' : 'p'
      const style =
        tag === 'h2'
          ? `margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:#111111;${align && align !== 'left' ? `text-align:${align};` : ''}`
          : paragraphStyle(align)
      into.prose.push(`<${tag} style="${style}">${inner}</${tag}>`)
      continue
    }
    renderBlocks(node.children, into, align)
  }
  flush()
}

function markKnownSections(html: string): string {
  let next = html
  next = next.replace(/<!--email-block:hero-->[\s\S]*?<!--\/email-block-->/gi, '')
  next = next.replace(
    /<!--email-section:(amount|payment-memo|zelle|pay-button)-->[\s\S]*?<!--\/email-section-->/gi,
    (_full, id: string) => `<x-section data-id="${id}"></x-section>`,
  )
  next = next.replace(
    /<!--email-block:payment-->[\s\S]*?<!--\/email-block-->/gi,
    '<x-section data-id="payment-memo"></x-section>',
  )
  next = next.replace(
    /<!--email-block:amount-->[\s\S]*?<!--\/email-block-->/gi,
    '<x-section data-id="amount"></x-section>',
  )
  next = next.replace(
    /<!--email-block:button-->[\s\S]*?<!--\/email-block-->/gi,
    '<x-section data-id="pay-button"></x-section>',
  )
  next = next.replace(
    /<!--payment-url:start-->[\s\S]*?<!--payment-url:end-->/gi,
    '<x-section data-id="pay-button"></x-section>',
  )
  next = next.replace(/<!--\/?email-block(?::[a-z-]+)?-->/gi, '')
  return next
}

function plainish(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function absorbDuplicateInstructions(rendered: Rendered) {
  const enabled = new Set(rendered.sections)
  const kept: string[] = []
  for (const block of rendered.prose) {
    const text = plainish(block)
    if (
      (text === '{{payment_memo}}' || text === 'payment memo') &&
      (enabled.has('payment-memo') || block.includes('{{payment_memo}}'))
    ) {
      enabled.add('payment-memo')
      continue
    }
    const mentionsZelle = text.includes('zelle') && text.includes('{{zelle_email}}')
    if (mentionsZelle && text.length < 180) {
      enabled.add('zelle')
      continue
    }
    kept.push(block)
  }
  rendered.prose = kept
  rendered.sections = EMAIL_SECTION_IDS.filter((id) => enabled.has(id))
}

export function readEmailDocument(html: string): EmailDocument {
  const rendered: Rendered = { prose: [], sections: [] }
  renderBlocks(parseNodes(markKnownSections(html)), rendered, null)
  absorbDuplicateInstructions(rendered)
  rendered.prose = repairStrayComma(
    dropLeadingSubjectEcho(rendered.prose).map(separateMergeFields),
  )
  const sections = emptyEmailSections()
  for (const id of rendered.sections) {
    sections[id] = true
  }
  return {
    proseHtml: rendered.prose.join('\n'),
    sections,
  }
}

function isSubjectEcho(block: string): boolean {
  const text = plainish(block)
  return (
    text === 'invoice' ||
    text === '{{invoice_number}}' ||
    text === 'from {{business_name}}' ||
    text === 'invoice {{invoice_number}}' ||
    text === 'invoice {{invoice_number}} from {{business_name}}'
  )
}

function dropLeadingSubjectEcho(prose: string[]): string[] {
  let index = 0
  while (index < prose.length && isSubjectEcho(prose[index])) {
    index += 1
  }
  if (index === 0) {
    return prose
  }
  const echoed = prose.slice(0, index).map(plainish).join(' ')
  if (!echoed.includes('{{invoice_number}}')) {
    return prose
  }
  return prose.slice(index)
}

function separateMergeFields(block: string): string {
  return block.replace(/(\{\{[a-z_]+\}\})(?=[A-Za-z])/g, '$1 ')
}

function repairStrayComma(prose: string[]): string[] {
  let stray = false
  const cleaned = prose.flatMap((block) => {
    const text = plainish(block)
    if (text === ',') {
      stray = true
      return []
    }
    if (!text.endsWith('.,')) {
      return [block]
    }
    stray = true
    return [block.replace(/,\s*(<\/[a-z][^>]*>\s*)$/i, '$1')]
  })
  if (!stray) {
    return cleaned
  }
  let moved = false
  return cleaned.map((block) => {
    if (moved || !block.includes('{{customer_name}}')) {
      return block
    }
    const next = block.replace(/(\{\{customer_name\}\})(?!,)/, '$1,')
    if (next !== block) {
      moved = true
    }
    return next
  })
}

function isSignoff(block: string): boolean {
  return /thank you/i.test(plainish(block))
}

export function writeEmailDocument(document: EmailDocument): string {
  const normalized = readEmailDocument(document.proseHtml)
  const prose = normalized.proseHtml ? normalized.proseHtml.split('\n') : []
  const signoff = prose.length > 0 && isSignoff(prose[prose.length - 1]) ? prose.pop() : undefined
  const parts = [...prose]
  for (const id of EMAIL_SECTION_IDS) {
    if (document.sections[id] || normalized.sections[id]) {
      parts.push(sectionWrap(id, SECTION_HTML[id]))
    }
  }
  if (signoff) {
    parts.push(signoff)
  }
  return parts.join('\n')
}

export function setEmailSection(
  html: string,
  id: EmailSectionId,
  enabled: boolean,
): string {
  const document = readEmailDocument(html)
  document.sections[id] = enabled
  return writeEmailDocument(document)
}

export function emailSectionEnabled(html: string, id: EmailSectionId): boolean {
  return readEmailDocument(html).sections[id]
}

function looksLikeMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

/** The message the editor, the preview, and the sent email all share. */
export function canonicalizeEmailBody(html: string): string {
  if (!looksLikeMarkup(html)) {
    return html
  }
  return writeEmailDocument(readEmailDocument(html))
}

export function variableChipHtml(id: EmailVariableId): string {
  return `<span data-email-var="${id}" contenteditable="false">${VARIABLE_LABEL[id]}</span>`
}

export function tokensToChips(html: string): string {
  return html
    .split(/(<[^>]+>)/g)
    .map((part, index) => {
      if (index % 2 === 1) {
        return part
      }
      return part.replace(TOKEN, (_full, id: string) => {
        if (id in VARIABLE_LABEL) {
          return variableChipHtml(id as EmailVariableId)
        }
        return ''
      })
    })
    .join('')
}

export function templateToEditorHtml(template: string): string {
  return tokensToChips(readEmailDocument(template).proseHtml || paragraph(''))
}

export function editorHtmlToTemplate(
  editorHtml: string,
  sections: Record<EmailSectionId, boolean>,
): string {
  return writeEmailDocument({
    proseHtml: editorHtml,
    sections,
  })
}

export function subjectToEditorHtml(subject: string): string {
  const safe = escapeText(subject.replace(/[\r\n]+/g, ' ').trim())
  return tokensToChips(safe) || ''
}

export function editorHtmlToSubject(html: string): string {
  const withTokens = html.replace(
    /<span\b[^>]*data-email-var="([a-z_]+)"[^>]*>[\s\S]*?<\/span>/gi,
    (_full, id: string) => (id in VARIABLE_LABEL ? `{{${id}}}` : ''),
  )
  return decodeEntities(withTokens.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
