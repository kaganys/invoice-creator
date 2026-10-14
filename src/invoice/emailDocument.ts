import {
  readEmailDocument,
  sanitizeProseHtml,
} from './emailCompose.ts'
import type { EmailBrandAssets } from './emailHtml.ts'

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

export type EmailBlock =
  | HeaderBlock
  | TextBlock
  | AmountBlock
  | PaymentBlock
  | ButtonBlock
  | LinkBlock
  | AttachmentBlock
  | FooterBlock

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
}

const MARKER = '<!--email-doc:v2-->'
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
    case 'header':
      return {
        ...headerBlock(id, enabled),
        background: safeEmailColor(attrs.background ?? '', '#111111'),
        color: safeEmailColor(attrs.color ?? '', '#f7f3ec'),
        showLogo: readFlag(attrs['show-logo'], true),
        showWordmark: readFlag(attrs['show-wordmark'], true),
        showName: readFlag(attrs['show-name'], true),
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
  if (source.includes(MARKER)) {
    return parseV2(source)
  }
  const html = looksLikeHtml(source) ? source : plainTextToHtml(source)
  return migrateLegacy(html)
}

function attrs(entries: Array<[string, string]>): string {
  return entries.map(([key, value]) => `${key}="${encodeAttr(value)}"`).join(' ')
}

function paymentToken(enabled: boolean): string {
  return enabled ? '<!--{{payment_url}}-->' : ''
}

function normalizeBlock(block: EmailBlock): EmailBlock {
  switch (block.type) {
    case 'header':
      return {
        ...block,
        background: safeEmailColor(block.background, '#111111'),
        color: safeEmailColor(block.color, '#f7f3ec'),
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
      return { ...block, lead: clip(block.lead) }
    case 'attachment':
      return { ...block, text: clip(block.text) }
    case 'footer':
      return { ...block, text: clip(block.text) }
  }
}

function openTag(block: EmailBlock): string {
  const base: Array<[string, string]> = [
    ['id', block.id],
    ['type', block.type],
    ['enabled', flag(block.enabled)],
  ]
  switch (block.type) {
    case 'header':
      base.push(
        ['background', block.background],
        ['color', block.color],
        ['show-logo', flag(block.showLogo)],
        ['show-wordmark', flag(block.showWordmark)],
        ['show-name', flag(block.showName)],
      )
      break
    case 'amount':
      base.push(
        ['label', block.label],
        ['due-label', block.dueLabel],
        ['background', block.background],
        ['border', block.border],
        ['label-color', block.labelColor],
        ['amount-color', block.amountColor],
      )
      break
    case 'payment':
      base.push(['show-zelle', flag(block.showZelle)], ['zelle-label', block.zelleLabel])
      break
    case 'button':
      base.push(['label', block.label], ['background', block.background], ['color', block.color])
      break
    case 'link':
      base.push(['lead', block.lead])
      break
    case 'attachment':
      base.push(['text', block.text])
      break
    case 'footer':
      base.push(['text', block.text])
      break
    case 'text':
      break
  }
  return `<!--email-block ${attrs(base)}-->`
}

function innerHtml(block: EmailBlock): string {
  if (block.type === 'text' || block.type === 'payment') {
    return block.html
  }
  if (block.type === 'amount') {
    return '<!--{{amount}}-->'
  }
  if ((block.type === 'button' || block.type === 'link') && block.enabled) {
    return paymentToken(true)
  }
  return ''
}

export function writeEmailBlocks(blocks: EmailBlock[]): string {
  const parts = [MARKER]
  for (const block of blocks.map(normalizeBlock)) {
    const inner = innerHtml(block)
    parts.push(inner ? `${openTag(block)}\n${inner}\n<!--/email-block-->` : `${openTag(block)}<!--/email-block-->`)
  }
  return parts.join('\n')
}

export function defaultEmailDocumentHtml(): string {
  return writeEmailBlocks(defaultEmailBlocks())
}

/** Stable form of whatever is saved, including older templates. */
export function canonicalizeEmailBody(html: string): string {
  if (!html.trim()) {
    return html
  }
  return writeEmailBlocks(readEmailBlocks(html))
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
    ? `<td valign="middle" bgcolor="${background}" style="padding:0;background:${background};font-size:0;line-height:0;"><img class="email-wordmark" src="${escapeHtml(wordmark)}" alt="${block.showName ? '' : '{{business_name}}'}" height="42" style="display:block;border:0;outline:none;text-decoration:none;height:42px;width:auto;max-width:280px;background:${background};" /></td>`
    : ''
  const images =
    logo || wordmark
      ? `<tr>${logoCell}${wordmarkCell}</tr>`
      : ''
  const nameRow = block.showName
    ? `<tr><td colspan="2" align="center" bgcolor="${background}" style="padding:${images ? '12px' : '0'} 0 0;background:${background};font-family:Georgia,'Times New Roman',serif;font-size:${images ? '15px' : '22px'};line-height:1.3;letter-spacing:0.04em;font-weight:${images ? '400' : '700'};color:${color};">{{business_name}}</td></tr>`
    : ''
  return `<tr><td class="email-pad" align="center" bgcolor="${background}" style="background:${background};padding:26px 28px 22px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${background}" style="margin:0 auto;background:${background};">${images}${nameRow}</table></td></tr>`
}

function renderTextRow(html: string, padding: string): string {
  if (!html.trim()) {
    return ''
  }
  return `<tr><td class="email-pad email-content" style="padding:${padding};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#111111;">${html}</td></tr>`
}

function renderAmount(block: AmountBlock): string {
  return `<tr><td class="email-pad" style="padding:8px 28px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${block.background};border:1px solid ${block.border};padding:18px 20px;"><p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${block.labelColor};font-weight:700;">${escapeHtml(block.label)}</p><p style="margin:6px 0 0;font-size:28px;line-height:1.2;font-weight:700;color:${block.amountColor};">{{amount}}</p><p style="margin:6px 0 0;font-size:14px;line-height:1.4;color:${block.labelColor};">${escapeHtml(block.dueLabel)}</p></td></tr></table></td></tr>`
}

function renderPayment(block: PaymentBlock): string {
  const zelle = block.showZelle
    ? paragraph(
        `${escapeHtml(block.zelleLabel)}: <strong style="color:#111111;">{{zelle_email}}</strong>`,
      )
    : ''
  return renderTextRow(`${block.html}${zelle}`, '4px 28px 8px')
}

function renderButton(block: ButtonBlock): string {
  return `<!--payment-url:start--><tr><td class="email-pad" align="center" style="padding:8px 28px;"><a href="{{payment_url}}" target="_blank" rel="noreferrer noopener" style="display:inline-block;background:${block.background};color:${block.color};padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">${escapeHtml(block.label)}</a></td></tr><!--payment-url:end-->`
}

function renderLink(block: LinkBlock): string {
  return `<!--payment-url:start--><tr><td class="email-pad" align="center" style="padding:0 28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#5c564e;text-align:center;">${escapeHtml(block.lead)}<br><a href="{{payment_url}}" target="_blank" rel="noreferrer noopener" style="color:#24352c;word-break:break-all;">{{payment_url}}</a></td></tr><!--payment-url:end-->`
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

function renderInner(block: EmailBlock): string {
  switch (block.type) {
    case 'text':
      return renderTextRow(block.html, '8px 28px')
    case 'amount':
      return renderAmount(block)
    case 'payment':
      return renderPayment(block)
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
    const inner = renderInner(block)
    if (inner) {
      card.push(inner)
    }
  }
  flush()
  return rows.join('\n')
}
