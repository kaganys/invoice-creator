export const FORMAT_VERSION = 1 as const

export const FONT_IDS = [
  'inter',
  'ibm-plex-sans',
  'source-sans-3',
  'arial',
  'georgia',
  'times',
  'source-serif-4',
  'lora',
  'libre-baskerville',
] as const

export type FontId = (typeof FONT_IDS)[number]

export type FontSource = 'primary' | 'secondary' | FontId

export const FONT_LABELS: Record<FontId, string> = {
  inter: 'Inter',
  'ibm-plex-sans': 'IBM Plex Sans',
  'source-sans-3': 'Source Sans 3',
  arial: 'Arial',
  georgia: 'Georgia',
  times: 'Times New Roman',
  'source-serif-4': 'Source Serif 4',
  lora: 'Lora',
  'libre-baskerville': 'Libre Baskerville',
}

export const FONT_CSS_FAMILY: Record<FontId, string> = {
  inter: 'Inter, system-ui, sans-serif',
  'ibm-plex-sans': '"IBM Plex Sans", "Helvetica Neue", sans-serif',
  'source-sans-3': '"Source Sans 3", "Segoe UI", sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  georgia: 'Georgia, serif',
  times: '"Times New Roman", Times, serif',
  'source-serif-4': '"Source Serif 4", Georgia, serif',
  lora: 'Lora, Georgia, serif',
  'libre-baskerville': '"Libre Baskerville", Georgia, serif',
}

export const FONT_WEIGHTS = [400, 500, 600, 700] as const
export type FontWeight = (typeof FONT_WEIGHTS)[number]

export const ELEMENT_KEYS = [
  'headerTitle',
  'invoiceNumber',
  'metaLabel',
  'metaValue',
  'fromLabel',
  'fromName',
  'fromDetails',
  'billLabel',
  'billName',
  'billDetails',
  'amountDueMain',
  'amountDueSupport',
  'payLink',
  'memo',
  'tableHeading',
  'lineDescription',
  'lineQty',
  'lineUnit',
  'lineAmount',
  'totalsLabel',
  'totalsValue',
  'amountDueLabel',
  'amountDueValue',
  'notesHeading',
  'notesText',
  'pageFooter',
] as const

export type ElementKey = (typeof ELEMENT_KEYS)[number]

export type TextAlign = 'left' | 'center' | 'right'
export type TextTransform = 'none' | 'uppercase' | 'capitalize'

export type ElementStyle = {
  font: FontSource
  sizePx: number
  weight: FontWeight
  color: string | null
  align: TextAlign | null
  letterSpacing: number | null
  transform: TextTransform | null
}

export type InvoiceFormat = {
  version: typeof FORMAT_VERSION
  global: {
    primaryFont: FontId
    secondaryFont: FontId
    primaryWeight: FontWeight
    secondaryWeight: FontWeight
    baseSizePx: number
    primaryColor: string
    mutedColor: string
    accentColor: string
    borderColor: string
  }
  elements: Record<ElementKey, ElementStyle>
}

const HEX = /^#([0-9a-fA-F]{6})$/

export function isHexColor(value: string): boolean {
  return HEX.test(value)
}

export function normalizeHex(value: string): string | null {
  const trimmed = value.trim()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  if (!isHexColor(withHash)) {
    return null
  }
  return withHash.toLowerCase()
}

function style(
  partial: Partial<ElementStyle> & Pick<ElementStyle, 'font' | 'sizePx' | 'weight'>,
): ElementStyle {
  return {
    color: null,
    align: null,
    letterSpacing: null,
    transform: null,
    ...partial,
  }
}

export function defaultInvoiceFormat(): InvoiceFormat {
  return {
    version: FORMAT_VERSION,
    global: {
      primaryFont: 'ibm-plex-sans',
      secondaryFont: 'source-serif-4',
      primaryWeight: 400,
      secondaryWeight: 400,
      baseSizePx: 14,
      primaryColor: '#111111',
      mutedColor: '#6b7280',
      accentColor: '#24352c',
      borderColor: '#111111',
    },
    elements: {
      headerTitle: style({ font: 'secondary', sizePx: 32, weight: 700, letterSpacing: 0.08, transform: 'uppercase' }),
      invoiceNumber: style({ font: 'primary', sizePx: 14, weight: 400 }),
      metaLabel: style({ font: 'primary', sizePx: 14, weight: 700 }),
      metaValue: style({ font: 'primary', sizePx: 14, weight: 400 }),
      fromLabel: style({ font: 'primary', sizePx: 12, weight: 700, transform: 'uppercase', letterSpacing: 0.04 }),
      fromName: style({ font: 'primary', sizePx: 14, weight: 700 }),
      fromDetails: style({ font: 'primary', sizePx: 14, weight: 400 }),
      billLabel: style({ font: 'primary', sizePx: 12, weight: 700, transform: 'uppercase', letterSpacing: 0.04 }),
      billName: style({ font: 'primary', sizePx: 14, weight: 700 }),
      billDetails: style({ font: 'primary', sizePx: 14, weight: 400 }),
      amountDueMain: style({ font: 'primary', sizePx: 22, weight: 700 }),
      amountDueSupport: style({ font: 'primary', sizePx: 22, weight: 700 }),
      payLink: style({ font: 'primary', sizePx: 14, weight: 400, color: '#24352c' }),
      memo: style({ font: 'primary', sizePx: 14, weight: 400 }),
      tableHeading: style({ font: 'primary', sizePx: 14, weight: 400, color: '#6b7280' }),
      lineDescription: style({ font: 'primary', sizePx: 14, weight: 400 }),
      lineQty: style({ font: 'primary', sizePx: 14, weight: 400, align: 'right' }),
      lineUnit: style({ font: 'primary', sizePx: 14, weight: 400, align: 'right' }),
      lineAmount: style({ font: 'primary', sizePx: 14, weight: 400, align: 'right' }),
      totalsLabel: style({ font: 'primary', sizePx: 14, weight: 400 }),
      totalsValue: style({ font: 'primary', sizePx: 14, weight: 400 }),
      amountDueLabel: style({ font: 'primary', sizePx: 14, weight: 700 }),
      amountDueValue: style({ font: 'primary', sizePx: 14, weight: 700 }),
      notesHeading: style({ font: 'primary', sizePx: 14, weight: 700 }),
      notesText: style({ font: 'primary', sizePx: 14, weight: 400 }),
      pageFooter: style({ font: 'primary', sizePx: 12, weight: 400, color: '#6b7280', align: 'right' }),
    },
  }
}

export function resolveFontId(format: InvoiceFormat, source: FontSource): FontId {
  if (source === 'primary') {
    return format.global.primaryFont
  }
  if (source === 'secondary') {
    return format.global.secondaryFont
  }
  return FONT_IDS.includes(source) ? source : format.global.primaryFont
}

export function resolveElementStyle(
  format: InvoiceFormat,
  key: ElementKey,
): {
  fontFamily: string
  fontSize: string
  fontWeight: number
  color: string
  textAlign: TextAlign
  letterSpacing: string
  textTransform: TextTransform
} {
  const defaults = defaultInvoiceFormat()
  const element = format.elements[key] ?? defaults.elements[key]
  const fontId = resolveFontId(format, element.font)
  return {
    fontFamily: FONT_CSS_FAMILY[fontId],
    fontSize: `${element.sizePx}px`,
    fontWeight: element.weight,
    color: element.color || format.global.primaryColor,
    textAlign: element.align ?? 'left',
    letterSpacing:
      element.letterSpacing == null ? 'normal' : `${element.letterSpacing}em`,
    textTransform: element.transform ?? 'none',
  }
}

export function formatToCssVars(format: InvoiceFormat): Record<string, string> {
  const vars: Record<string, string> = {
    '--inv-primary': format.global.primaryColor,
    '--inv-muted': format.global.mutedColor,
    '--inv-accent': format.global.accentColor,
    '--inv-border': format.global.borderColor,
    '--inv-base-size': `${format.global.baseSizePx}px`,
    '--inv-font-primary': FONT_CSS_FAMILY[format.global.primaryFont],
    '--inv-font-secondary': FONT_CSS_FAMILY[format.global.secondaryFont],
  }
  for (const key of ELEMENT_KEYS) {
    const resolved = resolveElementStyle(format, key)
    vars[`--inv-${key}-font`] = resolved.fontFamily
    vars[`--inv-${key}-size`] = resolved.fontSize
    vars[`--inv-${key}-weight`] = String(resolved.fontWeight)
    vars[`--inv-${key}-color`] = resolved.color
    vars[`--inv-${key}-align`] = resolved.textAlign
    vars[`--inv-${key}-tracking`] = resolved.letterSpacing
    vars[`--inv-${key}-transform`] = resolved.textTransform
  }
  return vars
}

export function cssVarsToStyle(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}: ${value};`)
    .join(' ')
}

export type FormatSectionId =
  | 'global'
  | 'header'
  | 'metadata'
  | 'from'
  | 'billTo'
  | 'amountDue'
  | 'memo'
  | 'lineItems'
  | 'totals'
  | 'notes'

export const FORMAT_SECTIONS: Array<{
  id: FormatSectionId
  label: string
  keys: ElementKey[]
}> = [
  { id: 'global', label: 'Global', keys: [] },
  { id: 'header', label: 'Invoice Header', keys: ['headerTitle', 'invoiceNumber'] },
  { id: 'metadata', label: 'Invoice Metadata', keys: ['metaLabel', 'metaValue'] },
  { id: 'from', label: 'From', keys: ['fromLabel', 'fromName', 'fromDetails'] },
  { id: 'billTo', label: 'Bill To', keys: ['billLabel', 'billName', 'billDetails'] },
  {
    id: 'amountDue',
    label: 'Amount Due',
    keys: ['amountDueMain', 'amountDueSupport', 'payLink'],
  },
  { id: 'memo', label: 'Payment Memo', keys: ['memo'] },
  {
    id: 'lineItems',
    label: 'Line Items',
    keys: ['tableHeading', 'lineDescription', 'lineQty', 'lineUnit', 'lineAmount'],
  },
  {
    id: 'totals',
    label: 'Totals',
    keys: ['totalsLabel', 'totalsValue', 'amountDueLabel', 'amountDueValue'],
  },
  { id: 'notes', label: 'Notes', keys: ['notesHeading', 'notesText', 'pageFooter'] },
]

export const ELEMENT_LABELS: Record<ElementKey, string> = {
  headerTitle: 'INVOICE heading',
  invoiceNumber: 'Invoice number',
  metaLabel: 'Labels',
  metaValue: 'Values',
  fromLabel: '"From" label',
  fromName: 'Business / person name',
  fromDetails: 'Address / contact',
  billLabel: '"Bill to" label',
  billName: 'Customer name',
  billDetails: 'Address / contact',
  amountDueMain: 'Main amount',
  amountDueSupport: 'Currency / due date',
  payLink: 'Pay online link',
  memo: 'Memo text',
  tableHeading: 'Table headings',
  lineDescription: 'Description',
  lineQty: 'Quantity',
  lineUnit: 'Unit price',
  lineAmount: 'Amount',
  totalsLabel: 'Subtotal / Total labels',
  totalsValue: 'Subtotal / Total values',
  amountDueLabel: 'Amount due label',
  amountDueValue: 'Amount due value',
  notesHeading: 'Notes heading',
  notesText: 'Notes text',
  pageFooter: 'Page footer',
}

function parseWeight(value: unknown, fallback: FontWeight): FontWeight {
  const num = typeof value === 'number' ? value : Number(value)
  return (FONT_WEIGHTS as readonly number[]).includes(num)
    ? (num as FontWeight)
    : fallback
}

function parseFontId(value: unknown, fallback: FontId): FontId {
  return typeof value === 'string' && (FONT_IDS as readonly string[]).includes(value)
    ? (value as FontId)
    : fallback
}

function parseFontSource(value: unknown, fallback: FontSource): FontSource {
  if (value === 'primary' || value === 'secondary') {
    return value
  }
  return parseFontId(value, fallback === 'primary' || fallback === 'secondary' ? 'inter' : fallback)
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }

export function validateInvoiceFormat(input: unknown): ValidationResult<InvoiceFormat> {
  const defaults = defaultInvoiceFormat()
  if (input == null) {
    return { ok: true, value: defaults }
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'Format must be a JSON object.' }
  }
  const record = input as Record<string, unknown>
  const globalIn = (record.global && typeof record.global === 'object'
    ? record.global
    : {}) as Record<string, unknown>

  const primaryColor =
    normalizeHex(String(globalIn.primaryColor ?? defaults.global.primaryColor))
  const mutedColor =
    normalizeHex(String(globalIn.mutedColor ?? defaults.global.mutedColor))
  const accentColor =
    normalizeHex(String(globalIn.accentColor ?? defaults.global.accentColor))
  const borderColor =
    normalizeHex(String(globalIn.borderColor ?? defaults.global.borderColor))
  if (!primaryColor || !mutedColor || !accentColor || !borderColor) {
    return { ok: false, message: 'Format colors must be 6-digit hex values.' }
  }

  const baseSizePx = Number(globalIn.baseSizePx ?? defaults.global.baseSizePx)
  if (!Number.isFinite(baseSizePx) || baseSizePx < 8 || baseSizePx > 48) {
    return { ok: false, message: 'Base font size must be between 8 and 48.' }
  }

  const elementsIn =
    record.elements && typeof record.elements === 'object'
      ? (record.elements as Record<string, unknown>)
      : {}

  const elements = { ...defaults.elements }
  for (const key of ELEMENT_KEYS) {
    const raw = elementsIn[key]
    const fallback = defaults.elements[key]
    if (!raw || typeof raw !== 'object') {
      elements[key] = fallback
      continue
    }
    const item = raw as Record<string, unknown>
    const sizePx = Number(item.sizePx ?? fallback.sizePx)
    if (!Number.isFinite(sizePx) || sizePx < 8 || sizePx > 72) {
      return { ok: false, message: `${key} font size must be between 8 and 72.` }
    }
    let color: string | null = fallback.color
    if ('color' in item) {
      if (item.color === null || item.color === '') {
        color = null
      } else {
        const parsed = normalizeHex(String(item.color))
        if (!parsed) {
          return { ok: false, message: `${key} color must be a 6-digit hex value.` }
        }
        color = parsed
      }
    }
    const align =
      item.align === 'left' || item.align === 'center' || item.align === 'right'
        ? item.align
        : fallback.align
    const transform =
      item.transform === 'none' ||
      item.transform === 'uppercase' ||
      item.transform === 'capitalize'
        ? item.transform
        : fallback.transform
    const letterSpacing =
      item.letterSpacing == null || item.letterSpacing === ''
        ? fallback.letterSpacing
        : Number(item.letterSpacing)
    if (letterSpacing != null && !Number.isFinite(letterSpacing)) {
      return { ok: false, message: `${key} letter spacing is invalid.` }
    }
    elements[key] = {
      font: parseFontSource(item.font, fallback.font),
      sizePx,
      weight: parseWeight(item.weight, fallback.weight),
      color,
      align,
      letterSpacing,
      transform,
    }
  }

  return {
    ok: true,
    value: {
      version: FORMAT_VERSION,
      global: {
        primaryFont: parseFontId(globalIn.primaryFont, defaults.global.primaryFont),
        secondaryFont: parseFontId(
          globalIn.secondaryFont,
          defaults.global.secondaryFont,
        ),
        primaryWeight: parseWeight(
          globalIn.primaryWeight,
          defaults.global.primaryWeight,
        ),
        secondaryWeight: parseWeight(
          globalIn.secondaryWeight,
          defaults.global.secondaryWeight,
        ),
        baseSizePx,
        primaryColor,
        mutedColor,
        accentColor,
        borderColor,
      },
      elements,
    },
  }
}

export function resetSection(
  format: InvoiceFormat,
  sectionId: FormatSectionId,
): InvoiceFormat {
  const defaults = defaultInvoiceFormat()
  if (sectionId === 'global') {
    return { ...format, global: defaults.global }
  }
  const section = FORMAT_SECTIONS.find((entry) => entry.id === sectionId)
  if (!section) {
    return format
  }
  const elements = { ...format.elements }
  for (const key of section.keys) {
    elements[key] = defaults.elements[key]
  }
  return { ...format, elements }
}
