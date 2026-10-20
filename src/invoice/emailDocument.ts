import { stripEditorCaretMarks } from './emailCaret.ts'
import {
  editorHtmlToSubject,
  readEmailDocument,
  sanitizeProseHtml,
  tokensToChips,
  variableChipHtml,
} from './emailCompose.ts'
import {
  EMPTY_METRICS,
  metricsActive,
  paintProseSpacing,
  parseLineHeight,
  parseSpaceStep,
  proseForEditor,
  spacingBlockHtml,
  type EmailSpacing,
  type LineHeightChoice,
  type SpaceStep,
} from './emailSpacing.ts'

export type EmailBrandAssets = {
  logoUrl?: string
  wordmarkUrl?: string
}

/**
 * Ordered email blocks. The saved template is this document. The preview and
 * the sent message are produced only by rendering enabled blocks, in order.
 */
export type HeaderBlock = {
  id: string
  type: 'header'
  enabled: boolean
  background: string
  color: string
  showLogo: boolean
  showWordmark: boolean
  showName: boolean
  /** Visible header line. Tokens such as {{business_name}} are allowed. */
  name: string
}

export type TextBlock = {
  id: string
  type: 'text'
  enabled: boolean
  html: string
}

export type AmountBlock = {
  id: string
  type: 'amount'
  enabled: boolean
  label: string
  dueLabel: string
  background: string
  border: string
  labelColor: string
  amountColor: string
}

export type PaymentBlock = {
  id: string
  type: 'payment'
  enabled: boolean
  html: string
  showZelle: boolean
  zelleLabel: string
}

export type ButtonBlock = {
  id: string
  type: 'button'
  enabled: boolean
  label: string
  background: string
  color: string
}

export type LinkBlock = {
  id: string
  type: 'link'
  enabled: boolean
  lead: string
  /** The payment-link chip. Stays off once the sender deletes it. */
  showUrl: boolean
}

export type AttachmentBlock = {
  id: string
  type: 'attachment'
  enabled: boolean
  text: string
}

export type FooterBlock = {
  id: string
  type: 'footer'
  enabled: boolean
  text: string
}

export type SpacingBlock = {
  id: string
  type: 'spacing'
  enabled: boolean
  lineHeight: LineHeightChoice | null
  before: SpaceStep | null
  after: SpaceStep | null
}

export type EmailBlock =
  | HeaderBlock
  | TextBlock
  | AmountBlock
  | PaymentBlock
  | ButtonBlock
  | LinkBlock
  | AttachmentBlock
  | FooterBlock
  | SpacingBlock

export type EmailBlockType = EmailBlock['type']

export const EMAIL_BLOCK_TYPES: EmailBlockType[] = [
  'header',
  'text',
  'amount',
  'payment',
  'button',
  'link',
  'attachment',
  'footer',
  'spacing',
]

const BLOCK_LABEL: Record<EmailBlockType, string> = {
  header: 'Header',
  text: 'Text',
  amount: 'Amount due',
  payment: 'Payment instructions',
  button: 'Pay button',
  link: 'Link fallback',
  attachment: 'Attachment note',
  footer: 'Footer',
  spacing: 'Spacing',
}

const MARKER_V2 = '<!--email-doc:v2-->'
const MARKER_V3 = '<!--email-doc:v3-->'
const PARAGRAPH =
  'margin:0 0 16px;font-size:16px;line-height:1.55;color:#111111;'

export function emailBlockLabel(type: EmailBlockType): string {
  return BLOCK_LABEL[type]
}

function paragraph(inner: string): string {
  return `<p style="${PARAGRAPH}">${inner}</p>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function encodeAttr(value: string): string {
  return escapeHtml(value).replace(/--/g, '&#45;&#45;')
}

function decodeAttr(value: string): string {
  return value
    .replace(/&#45;/g, '-')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function safeEmailColor(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed
  }
  return fallback
}

function flag(value: boolean): string {
  return value ? '1' : '0'
}

function readFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') {
    return fallback
  }
  return value === '1' || value === 'true'
}

function clip(value: string, max = 500): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function headerBlock(id: string, enabled = true): HeaderBlock {
  return {
    id,
    type: 'header',
    enabled,
    background: '#111111',
    color: '#f7f3ec',
    showLogo: true,
    showWordmark: true,
    showName: true,
    name: '{{business_name}}',
  }
}

function amountBlock(id: string, enabled = true): AmountBlock {
  return {
    id,
    type: 'amount',
    enabled,
    label: 'Amount due',
    dueLabel: 'Due {{due_date}}',
    background: '#f7f3ec',
    border: '#e4ddd2',
    labelColor: '#5c564e',
    amountColor: '#1c1917',
  }
}

function paymentBlock(
  id: string,
  extras: Partial<Pick<PaymentBlock, 'enabled' | 'html' | 'showZelle' | 'zelleLabel'>> = {},
): PaymentBlock {
  return {
    id,
    type: 'payment',
    enabled: extras.enabled ?? true,
    html: extras.html ?? paragraph('{{payment_memo}}'),
    showZelle: extras.showZelle ?? false,
    zelleLabel: extras.zelleLabel ?? 'Zelle',
  }
}

function buttonBlock(id: string, enabled = true): ButtonBlock {
  return {
    id,
    type: 'button',
    enabled,
    label: 'Pay Online',
    background: '#24352c',
    color: '#f7f3ec',
  }
}

function linkBlock(id: string, enabled = true): LinkBlock {
  return {
    id,
    type: 'link',
    enabled,
    lead: 'If the button does not work, open this secure link:',
    showUrl: true,
  }
}

function attachmentBlock(id: string, enabled = true): AttachmentBlock {
  return {
    id,
    type: 'attachment',
    enabled,
    text: 'A PDF copy of this invoice is attached to this email.',
  }
}

function spacingBlock(id: string, spacing: EmailSpacing = EMPTY_METRICS): SpacingBlock {
  return {
    id,
    type: 'spacing',
    enabled: true,
    lineHeight: spacing.lineHeight,
    before: spacing.before,
    after: spacing.after,
  }
}

function footerBlock(id: string, enabled = true): FooterBlock {
  return {
    id,
    type: 'footer',
    enabled,
    text: 'Sent by {{business_name}}',
  }
}

function textBlock(id: string, html: string, enabled = true): TextBlock {
  return { id, type: 'text', enabled, html }
}

export function defaultEmailBlocks(): EmailBlock[] {
  return [
    headerBlock('header'),
    textBlock('text-1', paragraph('Hello {{customer_name}},')),
    textBlock('text-2', paragraph('Please find invoice {{invoice_number}} attached as a PDF.')),
    amountBlock('amount'),
    paymentBlock('payment'),
    buttonBlock('button'),
    linkBlock('link'),
    textBlock('text-3', paragraph('Thank you,<br>{{business_name}}')),
    attachmentBlock('attachment'),
    footerBlock('footer'),
  ]
}

export function createEmailBlock(type: EmailBlockType, existing: EmailBlock[]): EmailBlock {
  const used = new Set(existing.map((block) => block.id))
  let id = type === 'text' ? 'text' : type
  let n = 2
  while (used.has(id)) {
    id = `${type}-${n}`
    n += 1
  }
  switch (type) {
    case 'header':
      return headerBlock(id)
    case 'text':
      return textBlock(id, paragraph(''))
    case 'amount':
      return amountBlock(id)
    case 'payment':
      return paymentBlock(id)
    case 'button':
      return buttonBlock(id)
    case 'link':
      return linkBlock(id)
    case 'attachment':
      return attachmentBlock(id)
    case 'footer':
      return footerBlock(id)
    case 'spacing':
      return spacingBlock(id)
  }
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function plainTextToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
  if (blocks.length === 0) {
    return paragraph('')
  }
  return blocks
    .map((block) => paragraph(escapeHtml(block).replace(/\n/g, '<br>')))
    .join('\n')
}

function isSignoff(html: string): boolean {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return text.includes('thank you')
}

/**
 * Older templates stored prose plus a few sections. The wrapper used to add
 * the header, the PDF line, and "Sent by" after the fact. Those become real
 * blocks so a saved message keeps the same content and the editor can remove it.
 */
function migrateLegacy(html: string): EmailBlock[] {
  const document = readEmailDocument(html)
  const prose = document.proseHtml
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
  const signoff = prose.length > 0 && isSignoff(prose[prose.length - 1]) ? prose.pop() ?? null : null
  const blocks: EmailBlock[] = [headerBlock('header')]
  prose.forEach((part, index) => {
    blocks.push(textBlock(`text-${index + 1}`, part))
  })
  if (document.sections.amount) {
    blocks.push(amountBlock('amount'))
  }
  if (document.sections['payment-memo'] || document.sections.zelle) {
    blocks.push(
      paymentBlock('payment', {
        html: document.sections['payment-memo'] ? paragraph('{{payment_memo}}') : '',
        showZelle: document.sections.zelle,
      }),
    )
  }
  if (document.sections['pay-button']) {
    blocks.push(buttonBlock('button'))
    blocks.push(linkBlock('link'))
  }
  if (signoff) {
    blocks.push(textBlock(`text-${prose.length + 1}`, signoff))
  }
  blocks.push(attachmentBlock('attachment'))
  blocks.push(footerBlock('footer'))
  return blocks
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  for (const match of raw.matchAll(pattern)) {
    const key = match[1].toLowerCase()
    if (!key || key.startsWith('/')) {
      continue
    }
    attrs[key] = decodeAttr(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attrs
}

function safeId(value: string, fallback: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40)
  return id || fallback
}

function parseBlock(attrs: Record<string, string>, inner: string, index: number): EmailBlock | null {
  const type = attrs.type as EmailBlockType
  if (!EMAIL_BLOCK_TYPES.includes(type)) {
    return null
  }
  const id = safeId(attrs.id ?? '', `${type}-${index + 1}`)
  const enabled = readFlag(attrs.enabled, true)
  const body = inner.trim()
  switch (type) {
    case 'header': {
      const showName = readFlag(attrs['show-name'], true)
      return {
        ...headerBlock(id, enabled),
        background: safeEmailColor(attrs.background ?? '', '#111111'),
        color: safeEmailColor(attrs.color ?? '', '#f7f3ec'),
        showLogo: readFlag(attrs['show-logo'], true),
        showWordmark: readFlag(attrs['show-wordmark'], true),
        showName,
        name: showName ? '{{business_name}}' : '',
      }
    }
    case 'text':
      return textBlock(id, body, enabled)
    case 'amount':
      return {
        ...amountBlock(id, enabled),
        label: clip(attrs.label ?? 'Amount due') || 'Amount due',
        dueLabel: clip(attrs['due-label'] ?? 'Due {{due_date}}'),
        background: safeEmailColor(attrs.background ?? '', '#f7f3ec'),
        border: safeEmailColor(attrs.border ?? '', '#e4ddd2'),
        labelColor: safeEmailColor(attrs['label-color'] ?? '', '#5c564e'),
        amountColor: safeEmailColor(attrs['amount-color'] ?? '', '#1c1917'),
      }
    case 'payment':
      return paymentBlock(id, {
        enabled,
        html: body,
        showZelle: readFlag(attrs['show-zelle'], false),
        zelleLabel: clip(attrs['zelle-label'] ?? 'Zelle') || 'Zelle',
      })
    case 'button':
      return {
        ...buttonBlock(id, enabled),
        label: clip(attrs.label ?? 'Pay Online') || 'Pay Online',
        background: safeEmailColor(attrs.background ?? '', '#24352c'),
        color: safeEmailColor(attrs.color ?? '', '#f7f3ec'),
      }
    case 'link':
      return {
        ...linkBlock(id, enabled),
        lead: clip(attrs.lead ?? linkBlock('link').lead),
      }
    case 'attachment':
      return {
        ...attachmentBlock(id, enabled),
        text: clip(attrs.text ?? attachmentBlock('attachment').text),
      }
    case 'footer':
      return {
        ...footerBlock(id, enabled),
        text: clip(attrs.text ?? footerBlock('footer').text),
      }
    case 'spacing':
      return spacingBlock(id, {
        lineHeight: parseLineHeight(attrs['line-height']),
        before: parseSpaceStep(attrs['space-before']),
        after: parseSpaceStep(attrs['space-after']),
      })
  }
}

function parseV2(source: string): EmailBlock[] {
  const pattern = /<!--email-block\s+([^>]*)-->([\s\S]*?)<!--\/email-block-->/g
  const blocks: EmailBlock[] = []
  for (const match of source.matchAll(pattern)) {
    const block = parseBlock(parseAttrs(match[1] ?? ''), match[2] ?? '', blocks.length)
    if (block) {
      blocks.push(block)
    }
  }
  const seen = new Set<string>()
  return blocks.map((block, index) => {
    let id = block.id
    while (seen.has(id)) {
      id = `${block.type}-${index + 2}`
    }
    seen.add(id)
    return id === block.id ? block : { ...block, id }
  })
}

export function readEmailBlocks(source: string): EmailBlock[] {
  if (source.includes(MARKER_V3)) {
    return parseV3(source)
  }
  if (source.includes(MARKER_V2)) {
    return parseV2(source)
  }
  const html = looksLikeHtml(source) ? source : plainTextToHtml(source)
  return migrateLegacy(html)
}

function normalizeBlock(block: EmailBlock): EmailBlock {
  switch (block.type) {
    case 'header': {
      const name = block.name.trim()
      return {
        ...block,
        background: safeEmailColor(block.background, '#111111'),
        color: safeEmailColor(block.color, '#f7f3ec'),
        name,
        showName: name.length > 0,
      }
    }
    case 'text':
      return { ...block, html: sanitizeProseHtml(block.html).trim() }
    case 'amount':
      return {
        ...block,
        label: clip(block.label) || 'Amount due',
        dueLabel: clip(block.dueLabel),
        background: safeEmailColor(block.background, '#f7f3ec'),
        border: safeEmailColor(block.border, '#e4ddd2'),
        labelColor: safeEmailColor(block.labelColor, '#5c564e'),
        amountColor: safeEmailColor(block.amountColor, '#1c1917'),
      }
    case 'payment':
      return {
        ...block,
        html: sanitizeProseHtml(block.html).trim(),
        zelleLabel: clip(block.zelleLabel) || 'Zelle',
      }
    case 'button':
      return {
        ...block,
        label: clip(block.label) || 'Pay Online',
        background: safeEmailColor(block.background, '#24352c'),
        color: safeEmailColor(block.color, '#f7f3ec'),
      }
    case 'link':
      return { ...block, lead: clip(block.lead), showUrl: block.showUrl !== false }
    case 'attachment':
      return { ...block, text: clip(block.text) }
    case 'footer':
      return { ...block, text: clip(block.text) }
    case 'spacing':
      return {
        ...block,
        enabled: true,
        lineHeight: parseLineHeight(block.lineHeight),
        before: parseSpaceStep(block.before),
        after: parseSpaceStep(block.after),
      }
  }
}

function dataAttrs(entries: Array<[string, string]>): string {
  return entries.map(([key, value]) => `${key}="${encodeAttr(value)}"`).join(' ')
}

function zelleParagraph(label: string): string {
  return paragraph(
    `${escapeHtml(label)}: <strong style="color:#111111;">{{zelle_email}}</strong>`,
  )
}

function isZelleParagraph(html: string): boolean {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return text.includes('zelle') && text.includes('{{zelle_email}}') && text.length < 180
}

function splitZelle(html: string): { html: string; zelle: boolean } {
  const parts = sanitizeProseHtml(html)
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
  return {
    zelle: parts.some(isZelleParagraph),
    html: parts.filter((part) => !isZelleParagraph(part)).join('\n'),
  }
}

function blockStoredHtml(block: EmailBlock): string {
  switch (block.type) {
    case 'header':
      return `<div ${dataAttrs([
        ['data-email-part', 'header'],
        ['data-background', block.background],
        ['data-color', block.color],
        ['data-logo', flag(block.showLogo)],
        ['data-wordmark', flag(block.showWordmark)],
        ['data-name', block.name],
      ])}></div>`
    case 'text':
      return block.html
    case 'amount':
      return `<div ${dataAttrs([
        ['data-email-part', 'amount'],
        ['data-background', block.background],
        ['data-border', block.border],
        ['data-label-color', block.labelColor],
        ['data-amount-color', block.amountColor],
        ['data-label', block.label],
        ['data-due', block.dueLabel],
      ])}><!--{{amount}}--></div>`
    case 'payment': {
      const inner = block.showZelle
        ? [block.html, zelleParagraph(block.zelleLabel)].filter(Boolean).join('\n')
        : block.html
      return `<div ${dataAttrs([
        ['data-email-part', 'payment'],
        ['data-zelle-label', block.zelleLabel],
      ])}>\n${inner}\n</div>`
    }
    case 'button':
      return `<div ${dataAttrs([
        ['data-email-part', 'button'],
        ['data-background', block.background],
        ['data-color', block.color],
        ['data-label', block.label],
      ])}><!--{{payment_url}}--></div>`
    case 'link':
      return `<p ${dataAttrs([
        ['data-email-part', 'link'],
        ['data-lead', block.lead],
        ['data-url', flag(block.showUrl)],
      ])}>${block.showUrl ? '<!--{{payment_url}}-->' : ''}</p>`
    case 'attachment':
      return `<p data-email-part="attachment">${escapeHtml(block.text)}</p>`
    case 'footer':
      return `<p data-email-part="footer">${escapeHtml(block.text)}</p>`
    case 'spacing':
      return spacingBlockHtml(block)
  }
}

function writeV3(blocks: EmailBlock[]): string {
  const lines = [MARKER_V3]
  const normalized = blocks.map(normalizeBlock)
  const ordered = [
    ...normalized.filter((block) => block.type === 'spacing' && metricsActive(block)),
    ...normalized.filter((block) => block.type !== 'spacing'),
  ]
  for (const block of ordered) {
    if (!block.enabled) {
      continue
    }
    if (block.type === 'spacing' && !metricsActive(block)) {
      continue
    }
    if (block.type === 'text' && !block.html.trim()) {
      continue
    }
    if (block.type === 'payment' && !block.html.trim() && !block.showZelle) {
      continue
    }
    if ((block.type === 'attachment' || block.type === 'footer') && !block.text.trim()) {
      continue
    }
    if (block.type === 'link' && !block.lead.trim() && !block.showUrl) {
      continue
    }
    lines.push(blockStoredHtml(block))
  }
  return lines.join('\n')
}

function openingTag(raw: string): string {
  const match = /^<[^>]+>/.exec(raw)
  return match?.[0] ?? ''
}

function elementInner(raw: string): string {
  return raw.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>\s*$/, '')
}

function partKind(raw: string): string | null {
  return parseAttrs(openingTag(raw).replace(/^</, '').replace(/>$/, ''))['data-email-part'] || null
}

function slotExists(raw: string, slot: string): boolean {
  return new RegExp(`data-email-slot="${slot}"`, 'i').test(raw)
}

function slotHtml(raw: string, slot: string): string {
  const match = new RegExp(
    `<([a-z0-9]+)\\b[^>]*data-email-slot="${slot}"[^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i',
  ).exec(raw)
  return match?.[2] ?? ''
}

function takeId(counts: Record<string, number>, type: string): string {
  const next = (counts[type] ?? 0) + 1
  counts[type] = next
  if (type === 'text') {
    return `text-${next}`
  }
  return next === 1 ? type : `${type}-${next}`
}

function findClose(html: string, from: number, tag: string): number {
  let depth = 1
  let index = from
  const lower = html.toLowerCase()
  const open = `<${tag}`
  const close = `</${tag}`
  while (index < html.length && depth > 0) {
    const nextOpen = lower.indexOf(open, index)
    const nextClose = lower.indexOf(close, index)
    if (nextClose === -1) {
      return html.length
    }
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const after = html[nextOpen + open.length] ?? ''
      if (/[\s>/]/.test(after)) {
        depth += 1
      }
      index = nextOpen + open.length
      continue
    }
    depth -= 1
    const gt = html.indexOf('>', nextClose)
    index = gt === -1 ? html.length : gt + 1
  }
  return index
}

function sliceTopLevel(html: string): string[] {
  const parts: string[] = []
  let index = 0
  while (index < html.length) {
    while (index < html.length && /\s/.test(html[index] ?? '')) {
      index += 1
    }
    if (index >= html.length) {
      break
    }
    if (html.startsWith('<!--', index)) {
      const end = html.indexOf('-->', index + 4)
      index = end === -1 ? html.length : end + 3
      continue
    }
    if (html[index] !== '<') {
      const next = html.indexOf('<', index)
      const text = html.slice(index, next === -1 ? html.length : next).trim()
      if (text) {
        parts.push(paragraph(escapeHtml(text)))
      }
      index = next === -1 ? html.length : next
      continue
    }
    const gt = html.indexOf('>', index + 1)
    if (gt === -1) {
      break
    }
    const token = html.slice(index + 1, gt).trim()
    if (token.startsWith('/')) {
      index = gt + 1
      continue
    }
    const name = token.split(/\s+/)[0]?.replace(/\/$/, '').toLowerCase() ?? ''
    if (!name) {
      index = gt + 1
      continue
    }
    if (token.endsWith('/') || name === 'br' || name === 'img' || name === 'hr') {
      parts.push(html.slice(index, gt + 1))
      index = gt + 1
      continue
    }
    const end = findClose(html, gt + 1, name)
    parts.push(html.slice(index, end))
    index = end
  }
  if (
    parts.length === 1 &&
    parts[0].startsWith('<div') &&
    !partKind(parts[0])
  ) {
    return sliceTopLevel(elementInner(parts[0]))
  }
  return parts
}

function proseBlocks(raw: string, counts: Record<string, number>): EmailBlock[] {
  const html = sanitizeProseHtml(raw).trim()
  if (!html) {
    return []
  }
  return html
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => textBlock(takeId(counts, 'text'), line))
}

function linkShowsEditorUrl(inner: string): boolean {
  if (/data-email-var="payment_url"/i.test(inner)) {
    return true
  }
  if (/<a\b[^>]*\bhref="\{\{payment_url\}\}"/i.test(inner)) {
    return true
  }
  return /\{\{\s*payment_url\s*\}\}/.test(inner.replace(/<!--[\s\S]*?-->/g, ''))
}

function linkVisibleLead(inner: string): string {
  const withoutUrl = inner
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*\bhref="\{\{payment_url\}\}"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<span\b[^>]*\bdata-email-var="payment_url"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/\{\{\s*payment_url\s*\}\}/g, '')
  return editorHtmlToSubject(withoutUrl)
}

function blockFromPart(kind: string, raw: string, id: string): EmailBlock | null {
  const attrs = parseAttrs(openingTag(raw).replace(/^</, '').replace(/>$/, ''))
  if (kind === 'header') {
    const slots = /data-email-slot=/.test(raw)
    const name = slots
      ? slotExists(raw, 'name')
        ? editorHtmlToSubject(slotHtml(raw, 'name'))
        : ''
      : (attrs['data-name'] ?? '{{business_name}}')
    return normalizeBlock({
      ...headerBlock(id),
      background: safeEmailColor(attrs['data-background'] ?? '', '#111111'),
      color: safeEmailColor(attrs['data-color'] ?? '', '#f7f3ec'),
      showLogo: slots ? slotExists(raw, 'logo') : readFlag(attrs['data-logo'], true),
      showWordmark: slots
        ? slotExists(raw, 'wordmark')
        : readFlag(attrs['data-wordmark'], true),
      name,
      showName: name.trim().length > 0,
    })
  }
  if (kind === 'amount') {
    const label = slotExists(raw, 'label')
      ? editorHtmlToSubject(slotHtml(raw, 'label'))
      : (attrs['data-label'] ?? 'Amount due')
    const dueLabel = slotExists(raw, 'due')
      ? editorHtmlToSubject(slotHtml(raw, 'due'))
      : (attrs['data-due'] ?? 'Due {{due_date}}')
    return normalizeBlock({
      ...amountBlock(id),
      label,
      dueLabel,
      background: safeEmailColor(attrs['data-background'] ?? '', '#f7f3ec'),
      border: safeEmailColor(attrs['data-border'] ?? '', '#e4ddd2'),
      labelColor: safeEmailColor(attrs['data-label-color'] ?? '', '#5c564e'),
      amountColor: safeEmailColor(attrs['data-amount-color'] ?? '', '#1c1917'),
    })
  }
  if (kind === 'payment') {
    const split = splitZelle(elementInner(raw))
    return normalizeBlock(
      paymentBlock(id, {
        html: split.html,
        showZelle: split.zelle,
        zelleLabel: clip(attrs['data-zelle-label'] ?? 'Zelle') || 'Zelle',
      }),
    )
  }
  if (kind === 'button') {
    const anchor = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(raw)
    const label = anchor
      ? editorHtmlToSubject(anchor[1] ?? '')
      : (attrs['data-label'] ?? 'Pay Online')
    return normalizeBlock({
      ...buttonBlock(id),
      label,
      background: safeEmailColor(attrs['data-background'] ?? '', '#24352c'),
      color: safeEmailColor(attrs['data-color'] ?? '', '#f7f3ec'),
    })
  }
  if (kind === 'link') {
    const inner = elementInner(raw)
    const visible = linkVisibleLead(inner)
    const editorUrl = linkShowsEditorUrl(inner)
    const stored = visible.length === 0 && !editorUrl
    const showUrl = editorUrl
      ? true
      : stored &&
        (attrs['data-url'] === '1' ||
          (attrs['data-url'] == null && /<!--\s*\{\{\s*payment_url\s*\}\}\s*-->/.test(inner)))
    return normalizeBlock({
      ...linkBlock(id),
      lead: visible || (stored ? (attrs['data-lead'] ?? '') : ''),
      showUrl,
    })
  }
  if (kind === 'attachment') {
    return normalizeBlock({
      ...attachmentBlock(id),
      text: editorHtmlToSubject(elementInner(raw)),
    })
  }
  if (kind === 'footer') {
    return normalizeBlock({
      ...footerBlock(id),
      text: editorHtmlToSubject(elementInner(raw)),
    })
  }
  if (kind === 'spacing') {
    return normalizeBlock(
      spacingBlock(id, {
        lineHeight: parseLineHeight(attrs['data-line-height']),
        before: parseSpaceStep(attrs['data-space-before']),
        after: parseSpaceStep(attrs['data-space-after']),
      }),
    )
  }
  return null
}

function blocksFromSlices(slices: string[]): EmailBlock[] {
  const counts: Record<string, number> = {}
  const blocks: EmailBlock[] = []
  for (const raw of slices) {
    const kind = partKind(raw)
    if (!kind) {
      blocks.push(...proseBlocks(raw, counts))
      continue
    }
    const block = blockFromPart(kind, raw, takeId(counts, kind))
    if (block) {
      blocks.push(block)
    }
  }
  return blocks
}

function parseV3(source: string): EmailBlock[] {
  return blocksFromSlices(sliceTopLevel(source.replace(MARKER_V3, '')))
}

function blockEditorHtml(block: EmailBlock, brand: EmailBrandAssets): string {
  switch (block.type) {
    case 'header': {
      const logo = block.showLogo
        ? `<img data-email-slot="logo" class="email-logo" src="${escapeHtml(brand.logoUrl ?? '')}" alt="" width="56" height="56" />`
        : ''
      const wordmark = block.showWordmark
        ? `<img data-email-slot="wordmark" class="email-wordmark" src="${escapeHtml(brand.wordmarkUrl ?? '')}" alt="" />`
        : ''
      const name = block.name.trim()
        ? `<p data-email-slot="name">${tokensToChips(escapeHtml(block.name))}</p>`
        : ''
      return `<div ${dataAttrs([
        ['data-email-part', 'header'],
        ['data-background', block.background],
        ['data-color', block.color],
        ['data-logo', flag(block.showLogo)],
        ['data-wordmark', flag(block.showWordmark)],
        ['data-name', block.name],
      ])} style="background:${block.background};color:${block.color}">${logo}${wordmark}${name}</div>`
    }
    case 'text':
      return tokensToChips(proseForEditor(block.html))
    case 'amount':
      return `<div ${dataAttrs([
        ['data-email-part', 'amount'],
        ['data-background', block.background],
        ['data-border', block.border],
        ['data-label-color', block.labelColor],
        ['data-amount-color', block.amountColor],
        ['data-label', block.label],
        ['data-due', block.dueLabel],
      ])} style="background:${block.background};border:1px solid ${block.border};color:${block.labelColor}"><p data-email-slot="label">${tokensToChips(escapeHtml(block.label))}</p><p data-email-slot="value" style="color:${block.amountColor}">${variableChipHtml('amount')}</p><p data-email-slot="due">${tokensToChips(escapeHtml(block.dueLabel))}</p></div>`
    case 'payment': {
      const inner = block.showZelle
        ? [block.html, zelleParagraph(block.zelleLabel)].filter(Boolean).join('\n')
        : block.html
      return `<div data-email-part="payment" data-zelle-label="${encodeAttr(block.zelleLabel)}">${tokensToChips(proseForEditor(inner))}</div>`
    }
    case 'button':
      return `<p ${dataAttrs([
        ['data-email-part', 'button'],
        ['data-background', block.background],
        ['data-color', block.color],
        ['data-label', block.label],
      ])}><a href="{{payment_url}}" style="display:inline-block;background:${block.background};color:${block.color};padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">${tokensToChips(escapeHtml(block.label))}</a></p>`
    case 'link': {
      const lead = tokensToChips(escapeHtml(block.lead))
      const chip = block.showUrl ? variableChipHtml('payment_url') : ''
      const inner = lead && chip ? `${lead}<br>${chip}` : `${lead}${chip}`
      return `<p ${dataAttrs([
        ['data-email-part', 'link'],
        ['data-lead', block.lead],
        ['data-url', flag(block.showUrl)],
      ])}>${inner}</p>`
    }
    case 'attachment':
      return `<p data-email-part="attachment">${tokensToChips(escapeHtml(block.text))}</p>`
    case 'footer':
      return `<p data-email-part="footer">${tokensToChips(escapeHtml(block.text))}</p>`
    case 'spacing':
      return spacingBlockHtml(block, true)
  }
}

export type EmailInsertKind = 'header' | 'amount' | 'button' | 'link' | 'attachment' | 'footer'

export function emailInsertHtml(
  kind: EmailInsertKind,
  brand: EmailBrandAssets = {},
): string {
  return blockEditorHtml(normalizeBlock(createEmailBlock(kind, [])), brand)
}

/** The letter shown in the editor. Same parts as the saved document, with field chips. */
export function documentToEditorHtml(
  source: string,
  brand: EmailBrandAssets = {},
): string {
  if (!source.trim()) {
    return ''
  }
  return readEmailBlocks(source)
    .filter((block) => block.enabled)
    .map((block) => blockEditorHtml(normalizeBlock(block), brand))
    .join('')
}

function stripEditorChrome(html: string): string {
  return html
    .replace(/<button\b[^>]*\bdata-email-chrome="[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<span\b[^>]*\bdata-email-chrome="[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
}

/** Saved document for whatever the editor is currently showing. */
export function editorHtmlToDocument(editorHtml: string): string {
  const blocks = blocksFromSlices(sliceTopLevel(stripEditorCaretMarks(stripEditorChrome(editorHtml))))
  if (blocks.length === 0) {
    return ''
  }
  return writeV3(blocks)
}

export function writeEmailBlocks(blocks: EmailBlock[]): string {
  return writeV3(blocks)
}

export function defaultEmailDocumentHtml(): string {
  return writeV3(defaultEmailBlocks())
}

/** Stable form of whatever is saved, including older templates. */
export function canonicalizeEmailBody(html: string): string {
  if (!html.trim()) {
    return html
  }
  return writeV3(readEmailBlocks(html))
}

function renderHeader(block: HeaderBlock, brand: EmailBrandAssets): string {
  const background = block.background
  const color = block.color
  const logo = block.showLogo ? (brand.logoUrl?.trim() ?? '') : ''
  const wordmark = block.showWordmark ? (brand.wordmarkUrl?.trim() ?? '') : ''
  if (!logo && !wordmark && !block.showName) {
    return `<tr><td bgcolor="${background}" style="background:${background};height:18px;line-height:18px;font-size:0;">&nbsp;</td></tr>`
  }
  const logoCell = logo
    ? `<td valign="middle" bgcolor="${background}" style="padding:0 16px 0 0;background:${background};font-size:0;line-height:0;"><img class="email-logo" src="${escapeHtml(logo)}" width="56" height="56" alt="" style="display:block;border:0;outline:none;text-decoration:none;width:56px;height:56px;background:${background};" /></td>`
    : ''
  const wordmarkCell = wordmark
    ? `<td valign="middle" bgcolor="${background}" style="padding:0;background:${background};font-size:0;line-height:0;"><img class="email-wordmark" src="${escapeHtml(wordmark)}" alt="${block.name.trim() ? '' : '{{business_name}}'}" height="42" style="display:block;border:0;outline:none;text-decoration:none;height:42px;width:auto;max-width:280px;background:${background};" /></td>`
    : ''
  const images =
    logo || wordmark
      ? `<tr>${logoCell}${wordmarkCell}</tr>`
      : ''
  const name = block.name.trim()
  const nameRow = name
    ? `<tr><td colspan="2" align="center" bgcolor="${background}" style="padding:${images ? '12px' : '0'} 0 0;background:${background};font-family:Georgia,'Times New Roman',serif;font-size:${images ? '15px' : '22px'};line-height:1.3;letter-spacing:0.04em;font-weight:${images ? '400' : '700'};color:${color};">${escapeHtml(name)}</td></tr>`
    : ''
  return `<tr><td class="email-pad" align="center" bgcolor="${background}" style="background:${background};padding:26px 28px 22px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${background}" style="margin:0 auto;background:${background};">${images}${nameRow}</table></td></tr>`
}

function renderTextRow(html: string, padding: string, spacing: EmailSpacing): string {
  if (!html.trim()) {
    return ''
  }
  const painted = paintProseSpacing(html, spacing)
  return `<tr><td class="email-pad email-content" style="padding:${padding};font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#111111;">${painted}</td></tr>`
}

function renderAmount(block: AmountBlock): string {
  return `<tr><td class="email-pad" style="padding:8px 28px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${block.background};border:1px solid ${block.border};border-left:3px solid #2f8f8a;padding:18px 20px;"><p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${block.labelColor};font-weight:700;">${escapeHtml(block.label)}</p><p style="margin:6px 0 0;font-size:28px;line-height:1.2;font-weight:700;color:${block.amountColor};">{{amount}}</p><p style="margin:6px 0 0;font-size:14px;line-height:1.4;color:${block.labelColor};">${escapeHtml(block.dueLabel)}</p></td></tr></table></td></tr>`
}

function renderPayment(block: PaymentBlock, spacing: EmailSpacing): string {
  const zelle = block.showZelle
    ? paragraph(
        `${escapeHtml(block.zelleLabel)}: <strong style="color:#111111;">{{zelle_email}}</strong>`,
      )
    : ''
  return renderTextRow(`${block.html}${zelle}`, '4px 28px 8px', spacing)
}

function renderButton(block: ButtonBlock): string {
  return `<!--payment-url:start--><tr><td class="email-pad" align="left" style="padding:8px 28px;"><a href="{{payment_url}}" target="_blank" rel="noreferrer noopener" style="display:inline-block;background:${block.background};color:${block.color};padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">${escapeHtml(block.label)}</a></td></tr><!--payment-url:end-->`
}

function renderLink(block: LinkBlock): string {
  const lead = escapeHtml(block.lead)
  if (!lead && !block.showUrl) {
    return ''
  }
  const url = block.showUrl
    ? `${lead ? '<br>' : ''}<a href="{{payment_url}}" target="_blank" rel="noreferrer noopener" style="color:#24352c;word-break:break-all;">{{payment_url}}</a>`
    : ''
  const row = `<tr><td class="email-pad" align="left" style="padding:0 28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#5c564e;text-align:left;">${lead}${url}</td></tr>`
  return block.showUrl ? `<!--payment-url:start-->${row}<!--payment-url:end-->` : row
}

function renderAttachment(block: AttachmentBlock): string {
  if (!block.text.trim()) {
    return ''
  }
  return `<tr><td class="email-pad" style="padding:8px 28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#4b5563;">${escapeHtml(block.text)}</td></tr>`
}

function renderFooter(block: FooterBlock): string {
  if (!block.text.trim()) {
    return ''
  }
  return `<tr><td class="email-pad" align="center" style="padding:18px 12px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#6b7280;text-align:center;">${escapeHtml(block.text)}</td></tr>`
}

function renderInner(block: EmailBlock, spacing: EmailSpacing): string {
  switch (block.type) {
    case 'text':
      return renderTextRow(block.html, '8px 28px', spacing)
    case 'amount':
      return renderAmount(block)
    case 'payment':
      return renderPayment(block, spacing)
    case 'button':
      return renderButton(block)
    case 'link':
      return renderLink(block)
    case 'attachment':
      return renderAttachment(block)
    default:
      return ''
  }
}

function spacingFromBlocks(blocks: EmailBlock[]): EmailSpacing {
  const spacing = blocks.find((block) => block.type === 'spacing' && block.enabled)
  if (!spacing || spacing.type !== 'spacing') {
    return { ...EMPTY_METRICS }
  }
  return {
    lineHeight: spacing.lineHeight,
    before: spacing.before,
    after: spacing.after,
  }
}

const CARD_BREAK = new Set<EmailBlockType>(['header', 'footer'])

/** Rows for the email shell. Disabled blocks are omitted. Nothing else is added. */
export function renderEmailBlocks(blocks: EmailBlock[], brand: EmailBrandAssets = {}): string {
  const rows: string[] = []
  let card: string[] = []
  const flush = () => {
    if (card.length === 0) {
      return
    }
    rows.push(
      `<tr><td class="email-card" style="background:#fffcf8;border:1px solid #e4ddd2;padding:12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${card.join('')}</table></td></tr>`,
    )
    card = []
  }
  const spacing = spacingFromBlocks(blocks)
  for (const block of blocks) {
    if (!block.enabled) {
      continue
    }
    if (CARD_BREAK.has(block.type)) {
      flush()
      if (block.type === 'header') {
        rows.push(renderHeader(block, brand))
      } else if (block.type === 'footer') {
        rows.push(renderFooter(block))
      }
      continue
    }
    const inner = renderInner(block, spacing)
    if (inner) {
      card.push(inner)
    }
  }
  flush()
  return rows.join('\n')
}
