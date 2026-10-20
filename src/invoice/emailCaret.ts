/** Invisible text that gives the caret a place beside a non-editable chip. */
export const CARET_GAP = '\u200b'

const CHIP_SOURCE = '<span\\b[^>]*\\bdata-email-var="[^"]+"[^>]*>[\\s\\S]*?<\\/span>'

/** Drop caret padding so a saved letter does not grow an empty paragraph or a hidden character. */
export function stripEditorCaretMarks(html: string): string {
  return html
    .replaceAll(CARET_GAP, '')
    .replace(/<p\b[^>]*\bdata-email-gap(?:="[^"]*")?[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '')
    .replace(/\sdata-email-gap="[^"]*"/gi, '')
    .replace(/\sdata-email-gap(?=[\s>])/gi, '')
}

function withoutTrailingGap(html: string): string {
  return stripEditorCaretMarks(html).trim()
}

/** True when the letter ends on a chip, so there is no native caret after it. */
export function documentEndsWithAtom(html: string): boolean {
  return /data-email-var="[^"]+"[^>]*>[^<]*<\/span>\s*(?:<\/[a-z0-9]+>\s*)*$/i.test(
    withoutTrailingGap(html),
  )
}

/** An empty paragraph after a trailing chip. Clicking it places the caret at the end of the letter. */
export function ensureTrailingEditableGap(html: string): string {
  const body = withoutTrailingGap(html)
  if (!documentEndsWithAtom(body)) {
    return body
  }
  return `${body}<p data-email-gap=""><br></p>`
}

export type CaretAfterChip = {
  html: string
  /** Offset of an editable caret that sits after the last chip. */
  index: number
}

/**
 * Where a collapsed caret can sit after the last chip.
 * When that chip ends the letter, the caret is inside the trailing gap.
 */
export function caretAfterLastChip(html: string): CaretAfterChip | null {
  const withGap = ensureTrailingEditableGap(html)
  const chips = [...withGap.matchAll(new RegExp(CHIP_SOURCE, 'gi'))]
  const last = chips[chips.length - 1]
  if (!last || last.index == null) {
    return null
  }
  const chipEnd = last.index + last[0].length
  const gapAt = withGap.indexOf('<p data-email-gap="">', chipEnd)
  if (gapAt === -1) {
    return { html: withGap, index: chipEnd }
  }
  return { html: withGap, index: withGap.indexOf('>', gapAt) + 1 }
}
