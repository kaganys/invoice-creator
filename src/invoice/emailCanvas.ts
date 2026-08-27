import {
  EMAIL_BLOCKS,
  PAYMENT_LINK_NOTE_HTML,
  emailBlockHtml,
  emailVariableChip,
  splitButtonAndNote,
  splitTopLevelParagraphs,
  type EmailBlockId,
} from './emailBlocks.ts'

export type EmailCanvasBlockType = EmailBlockId | 'html'

export type EmailCanvasBlock = {
  id: string
  type: EmailCanvasBlockType
  html: string
}

const BLOCK_IDS = new Set(EMAIL_BLOCKS.map((block) => block.id))

const MARKER = /<!--email-block:([a-z_]+)-->\s*([\s\S]*?)\s*<!--\/email-block-->/g

function isEmailBlockId(value: string): value is EmailBlockId {
  return BLOCK_IDS.has(value as EmailBlockId)
}

export function createCanvasBlockId(): string {
  return crypto.randomUUID()
}

export function wrapEmailBlock(type: EmailCanvasBlockType, html: string): string {
  return `<!--email-block:${type}-->\n${html.trim()}\n<!--/email-block-->`
}

export function serializeEmailBlocks(blocks: EmailCanvasBlock[]): string {
  return blocks
    .map((block) => wrapEmailBlock(block.type, block.html))
    .join('\n')
}

export function createBlockFromPalette(type: EmailBlockId): EmailCanvasBlock {
  return {
    id: createCanvasBlockId(),
    type,
    html: emailBlockHtml(type),
  }
}

export function createFieldItem(variableId: string): EmailCanvasBlock {
  return {
    id: createCanvasBlockId(),
    type: 'text',
    html: `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#111111;">${emailVariableChip(variableId)}</p>`,
  }
}

function expandCanvasBlocks(blocks: EmailCanvasBlock[]): EmailCanvasBlock[] {
  return blocks.flatMap((block) => {
    if (
      block.type === 'greeting' ||
      block.type === 'html' ||
      block.type === 'text'
    ) {
      const parts = splitTopLevelParagraphs(block.html)
      if (parts.length > 1) {
        return parts.map((html) => ({
          id: createCanvasBlockId(),
          type: 'text' as const,
          html,
        }))
      }
    }
    if (block.type === 'greeting') {
      return [{ ...block, type: 'text' }]
    }
    if (block.type === 'button') {
      const split = splitButtonAndNote(block.html)
      if (split.note) {
        return [
          {
            id: createCanvasBlockId(),
            type: 'button',
            html: split.button,
          },
          {
            id: createCanvasBlockId(),
            type: 'text',
            html: split.note,
          },
        ]
      }
    }
    return [block]
  })
}

export function defaultCanvasBlocks(): EmailCanvasBlock[] {
  return expandCanvasBlocks([
    createBlockFromPalette('hero'),
    createBlockFromPalette('greeting'),
    createBlockFromPalette('amount'),
    createBlockFromPalette('payment'),
    createBlockFromPalette('button'),
    { id: createCanvasBlockId(), type: 'text', html: PAYMENT_LINK_NOTE_HTML },
    createBlockFromPalette('note'),
  ])
}

function splitUnmarkedHtml(html: string): EmailCanvasBlock[] {
  const found: { index: number; end: number; id: EmailBlockId }[] = []
  for (const block of EMAIL_BLOCKS) {
    let from = 0
    while (from < html.length) {
      const index = html.indexOf(block.html, from)
      if (index === -1) {
        break
      }
      found.push({ index, end: index + block.html.length, id: block.id })
      from = index + block.html.length
    }
  }
  found.sort((left, right) => left.index - right.index)
  if (found.length === 0) {
    return [{ id: createCanvasBlockId(), type: 'html', html }]
  }

  const blocks: EmailCanvasBlock[] = []
  let cursor = 0
  for (const match of found) {
    if (match.index < cursor) {
      continue
    }
    const gap = html.slice(cursor, match.index).trim()
    if (gap) {
      blocks.push({ id: createCanvasBlockId(), type: 'html', html: gap })
    }
    blocks.push({
      id: createCanvasBlockId(),
      type: match.id,
      html: html.slice(match.index, match.end).trim(),
    })
    cursor = match.end
  }
  const tail = html.slice(cursor).trim()
  if (tail) {
    blocks.push({ id: createCanvasBlockId(), type: 'html', html: tail })
  }
  return expandCanvasBlocks(
    blocks.length > 0
      ? blocks
      : [{ id: createCanvasBlockId(), type: 'html', html }],
  )
}

export function parseEmailHtmlToBlocks(html: string): EmailCanvasBlock[] {
  const trimmed = html.trim()
  if (!trimmed) {
    return defaultCanvasBlocks()
  }

  const marked: EmailCanvasBlock[] = []
  let last = 0
  const matcher = new RegExp(MARKER.source, 'g')
  let match = matcher.exec(html)
  while (match) {
    const gap = html.slice(last, match.index).trim()
    if (gap) {
      marked.push({ id: createCanvasBlockId(), type: 'html', html: gap })
    }
    const rawType = match[1] ?? 'html'
    const type: EmailCanvasBlockType = isEmailBlockId(rawType)
      ? rawType
      : 'html'
    marked.push({
      id: createCanvasBlockId(),
      type,
      html: (match[2] ?? '').trim(),
    })
    last = match.index + match[0].length
    match = matcher.exec(html)
  }

  if (marked.length === 0) {
    return splitUnmarkedHtml(html)
  }

  const tail = html.slice(last).trim()
  if (tail) {
    marked.push({ id: createCanvasBlockId(), type: 'html', html: tail })
  }
  return expandCanvasBlocks(marked)
}

export function moveCanvasBlock(
  blocks: EmailCanvasBlock[],
  fromIndex: number,
  toIndex: number,
): EmailCanvasBlock[] {
  if (
    fromIndex < 0 ||
    fromIndex >= blocks.length ||
    toIndex < 0 ||
    toIndex > blocks.length
  ) {
    return blocks
  }
  const next = [...blocks]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) {
    return blocks
  }
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex
  next.splice(insertAt, 0, moved)
  return next
}

export function insertCanvasBlock(
  blocks: EmailCanvasBlock[],
  index: number,
  block: EmailCanvasBlock,
): EmailCanvasBlock[] {
  const next = [...blocks]
  const at = Math.max(0, Math.min(index, next.length))
  next.splice(at, 0, block)
  return next
}
