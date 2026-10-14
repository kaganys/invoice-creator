/**
 * Line height and paragraph spacing for the letter.
 * Stored paragraphs keep an explicit choice on data attributes.
 * The sent email and the preview paint the effective values as inline styles.
 */

export const PARAGRAPH_STYLE =
  'margin:0 0 16px;font-size:16px;line-height:1.55;color:#111111;'

export const LINE_HEIGHTS = ['1', '1.15', '1.5', '2'] as const
export type LineHeightChoice = (typeof LINE_HEIGHTS)[number]

export const SPACE_STEPS = ['none', 'small', 'normal', 'large'] as const
export type SpaceStep = (typeof SPACE_STEPS)[number]

export const SPACE_PX: Record<SpaceStep, string> = {
  none: '0',
  small: '8px',
  normal: '16px',
  large: '28px',
}

export type ParagraphMetrics = {
  lineHeight: LineHeightChoice | null
  before: SpaceStep | null
  after: SpaceStep | null
}

export type EmailSpacing = ParagraphMetrics

export const EMPTY_METRICS: ParagraphMetrics = {
  lineHeight: null,
  before: null,
  after: null,
}

const LINE_HEIGHT_SET = new Set<string>(LINE_HEIGHTS)
const SPACE_SET = new Set<string>(SPACE_STEPS)

export function parseLineHeight(value: string | null | undefined): LineHeightChoice | null {
  const raw = (value ?? '').trim()
  if (LINE_HEIGHT_SET.has(raw)) {
    return raw as LineHeightChoice
  }
  const numeric = Number(raw)
  if (numeric === 1) {
    return '1'
  }
  if (numeric === 1.15) {
    return '1.15'
  }
  if (numeric === 1.5) {
    return '1.5'
  }
  if (numeric === 2) {
    return '2'
  }
  return null
}

export function parseSpaceStep(value: string | null | undefined): SpaceStep | null {
  const raw = (value ?? '').trim().toLowerCase()
  return SPACE_SET.has(raw) ? (raw as SpaceStep) : null
}

export function spaceCss(step: SpaceStep): string {
  return step === 'none' ? '0px' : SPACE_PX[step]
}

export function metricsActive(metrics: ParagraphMetrics): boolean {
  return Boolean(metrics.lineHeight || metrics.before || metrics.after)
}

function parseAttrString(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  for (const match of raw.matchAll(pattern)) {
    const key = match[1]?.toLowerCase() ?? ''
    if (!key || key.startsWith('/')) {
      continue
    }
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

function styleNumber(style: string, property: string): number | null {
  const match = new RegExp(`${property}\\s*:\\s*([0-9.]+)`, 'i').exec(style)
  if (!match) {
    return null
  }
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function lineHeightFromStyle(style: string): LineHeightChoice | null {
  return parseLineHeight(styleNumber(style, 'line-height')?.toString() ?? '')
}

function stepFromPx(value: string | null): SpaceStep | null {
  if (value == null) {
    return null
  }
  const numeric = value === '0' ? 0 : Number(value.replace(/px$/i, ''))
  if (numeric === 0) {
    return 'none'
  }
  if (numeric === 8) {
    return 'small'
  }
  if (numeric === 16) {
    return 'normal'
  }
  if (numeric === 28) {
    return 'large'
  }
  return null
}

function marginSides(style: string): { top: string | null; bottom: string | null } {
  const topLong = /(?:^|;)\s*margin-top\s*:\s*([^;]+)/i.exec(style)
  const bottomLong = /(?:^|;)\s*margin-bottom\s*:\s*([^;]+)/i.exec(style)
  const shorthand = /(?:^|;)\s*margin\s*:\s*([^;]+)/i.exec(style)
  let top = topLong?.[1]?.trim() ?? null
  let bottom = bottomLong?.[1]?.trim() ?? null
  if (shorthand && top == null && bottom == null) {
    const parts = shorthand[1].trim().split(/\s+/)
    if (parts.length === 1) {
      top = parts[0] ?? null
      bottom = parts[0] ?? null
    } else if (parts.length === 2) {
      top = parts[0] ?? null
      bottom = parts[0] ?? null
    } else if (parts.length >= 3) {
      top = parts[0] ?? null
      bottom = parts[2] ?? null
    }
  }
  return { top, bottom }
}

export function metricsFromAttrs(attrs: Record<string, string>): ParagraphMetrics {
  const style = attrs.style ?? ''
  const sides = marginSides(style)
  const beforeFromStyle = stepFromPx(sides.top)
  const afterFromStyle = stepFromPx(sides.bottom)
  return {
    lineHeight: parseLineHeight(attrs['data-line-height']) ?? lineHeightFromStyle(style),
    before:
      parseSpaceStep(attrs['data-space-before']) ??
      (beforeFromStyle && beforeFromStyle !== 'none' ? beforeFromStyle : null),
    after:
      parseSpaceStep(attrs['data-space-after']) ??
      (afterFromStyle && afterFromStyle !== 'normal' ? afterFromStyle : null),
  }
}

export function textAlignFromAttrs(attrs: Record<string, string>): 'left' | 'center' | 'right' | null {
  const style = attrs.style ?? ''
  const fromStyle = /text-align\s*:\s*(left|center|right)/i.exec(style)
  if (fromStyle) {
    return fromStyle[1].toLowerCase() as 'left' | 'center' | 'right'
  }
  const align = (attrs.align ?? '').toLowerCase()
  if (align === 'left' || align === 'center' || align === 'right') {
    return align
  }
  return null
}

export function metricsAttributes(metrics: ParagraphMetrics): string {
  const parts: string[] = []
  if (metrics.lineHeight) {
    parts.push(`data-line-height="${metrics.lineHeight}"`)
  }
  if (metrics.before) {
    parts.push(`data-space-before="${metrics.before}"`)
  }
  if (metrics.after) {
    parts.push(`data-space-after="${metrics.after}"`)
  }
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

function marginDeclaration(top: string, bottom: string): string {
  const lead = top === '0px' ? '0' : top
  const trail = bottom === '0px' ? '0' : bottom
  if (lead === '0' && trail === '0') {
    return 'margin:0;'
  }
  if (lead === '0') {
    return `margin:0 0 ${trail};`
  }
  if (trail === '0') {
    return `margin:${lead} 0 0;`
  }
  if (lead === trail) {
    return `margin:${lead} 0;`
  }
  return `margin:${lead} 0 ${trail};`
}

function alignDeclaration(align: string | null): string {
  if (!align || align === 'left') {
    return ''
  }
  return `text-align:${align};`
}

/** Full inline style stored on a paragraph and copied into the sent email. */
export function paragraphDeclaration(align: string | null, metrics: ParagraphMetrics): string {
  const top = metrics.before ? spaceCss(metrics.before) : '0'
  const bottom = metrics.after ? spaceCss(metrics.after) : '16px'
  const line = metrics.lineHeight ?? '1.55'
  return `${marginDeclaration(top, bottom)}font-size:16px;line-height:${line};color:#111111;${alignDeclaration(align)}`
}

export function headingDeclaration(align: string | null, metrics: ParagraphMetrics): string {
  const top = metrics.before ? spaceCss(metrics.before) : '0'
  const bottom = metrics.after ? spaceCss(metrics.after) : '12px'
  const line = metrics.lineHeight ?? '1.3'
  return `${marginDeclaration(top, bottom)}font-size:20px;line-height:${line};font-weight:700;color:#111111;${alignDeclaration(align)}`
}

export function listDeclaration(align: string | null, metrics: ParagraphMetrics): string {
  const top = metrics.before ? spaceCss(metrics.before) : '0'
  const bottom = metrics.after ? spaceCss(metrics.after) : '16px'
  const line = metrics.lineHeight ? `line-height:${metrics.lineHeight};` : ''
  return `${marginDeclaration(top, bottom)}padding-left:22px;${line}${alignDeclaration(align)}`
}

export function itemDeclaration(metrics: ParagraphMetrics): string {
  const parts: string[] = []
  if (metrics.before) {
    parts.push(`margin-top:${spaceCss(metrics.before)}`)
  }
  if (metrics.after) {
    parts.push(`margin-bottom:${spaceCss(metrics.after)}`)
  }
  if (metrics.lineHeight) {
    parts.push(`line-height:${metrics.lineHeight}`)
  }
  return parts.join(';')
}

/** Style shown in the editor. Unset sides stay on the email defaults. */
export function editorDeclaration(
  kind: 'p' | 'h2' | 'list' | 'li',
  align: string | null,
  metrics: ParagraphMetrics,
): string {
  const parts: string[] = []
  if (metrics.before && metrics.after) {
    parts.push(
      marginDeclaration(spaceCss(metrics.before), spaceCss(metrics.after)).replace(/;$/, ''),
    )
  } else if (metrics.before) {
    parts.push(`margin-top:${spaceCss(metrics.before)}`)
  } else if (metrics.after) {
    parts.push(`margin-bottom:${spaceCss(metrics.after)}`)
  }
  if (kind === 'p') {
    parts.push('font-size:16px')
  }
  if (kind === 'h2') {
    parts.push('font-size:20px', 'font-weight:700')
  }
  if (metrics.lineHeight) {
    parts.push(`line-height:${metrics.lineHeight}`)
  }
  if (kind === 'p' || kind === 'h2') {
    parts.push('color:#111111')
  }
  const aligned = alignDeclaration(align).replace(/;$/, '')
  if (aligned) {
    parts.push(aligned)
  }
  return parts.join(';')
}

function storedDeclaration(
  kind: 'p' | 'h2' | 'list' | 'li',
  align: string | null,
  metrics: ParagraphMetrics,
): string {
  if (kind === 'h2') {
    return headingDeclaration(align, metrics)
  }
  if (kind === 'list') {
    return listDeclaration(align, metrics)
  }
  if (kind === 'li') {
    return itemDeclaration(metrics)
  }
  return paragraphDeclaration(align, metrics)
}

function mergeMetrics(explicit: ParagraphMetrics, email: EmailSpacing, inheritEmail: boolean): ParagraphMetrics {
  if (!inheritEmail) {
    return explicit
  }
  return {
    lineHeight: explicit.lineHeight ?? email.lineHeight,
    before: explicit.before ?? email.before,
    after: explicit.after ?? email.after,
  }
}

function rewriteTags(
  html: string,
  email: EmailSpacing,
  mode: 'editor' | 'send',
): string {
  return html.replace(/<(p|h2|ul|ol|li)\b([^<>]*)>/gi, (_full, tag: string, raw: string) => {
    const name = tag.toLowerCase()
    const kind = name === 'ul' || name === 'ol' ? 'list' : (name as 'p' | 'h2' | 'li')
    const attrs = parseAttrString(raw)
    const explicit = metricsFromAttrs(attrs)
    const align = textAlignFromAttrs(attrs)
    const metrics =
      mode === 'send' ? mergeMetrics(explicit, email, kind !== 'li') : explicit
    const style =
      mode === 'editor'
        ? editorDeclaration(kind, align, explicit)
        : storedDeclaration(kind, align, metrics)
    const data = metricsAttributes(mode === 'editor' ? explicit : explicit)
    if (!style && !data) {
      return `<${name}>`
    }
    const styleAttr = style ? ` style="${style}${style.endsWith(';') ? '' : ';'}"` : ''
    return `<${name}${data}${styleAttr}>`
  })
}

/** Drop built-in metrics so the editor's email defaults can show through. */
export function proseForEditor(html: string): string {
  return rewriteTags(html, EMPTY_METRICS, 'editor')
}

/**
 * Inline the email default onto paragraphs that do not have their own choice.
 * List items keep only an explicit choice; they inherit line height from the list.
 */
export function paintProseSpacing(html: string, email: EmailSpacing): string {
  if (!metricsActive(email) && !/data-line-height=|data-space-before=|data-space-after=/.test(html)) {
    return html
  }
  return rewriteTags(html, email, 'send')
}

export function emailSpacingFromHtml(html: string): EmailSpacing {
  const match = /<div\b[^>]*data-email-part=(?:"spacing"|'spacing')[^>]*>/i.exec(html)
  if (!match) {
    return { ...EMPTY_METRICS }
  }
  const attrs = parseAttrString(match[0])
  return {
    lineHeight: parseLineHeight(attrs['data-line-height']),
    before: parseSpaceStep(attrs['data-space-before']),
    after: parseSpaceStep(attrs['data-space-after']),
  }
}

export function spacingBlockHtml(spacing: EmailSpacing, editor = false): string {
  if (!metricsActive(spacing)) {
    return ''
  }
  const attrs = [
    'data-email-part="spacing"',
    spacing.lineHeight ? `data-line-height="${spacing.lineHeight}"` : '',
    spacing.before ? `data-space-before="${spacing.before}"` : '',
    spacing.after ? `data-space-after="${spacing.after}"` : '',
    editor ? 'contenteditable="false"' : '',
  ].filter(Boolean)
  return `<div ${attrs.join(' ')}></div>`
}
